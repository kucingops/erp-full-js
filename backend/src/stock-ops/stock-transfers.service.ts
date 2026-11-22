import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { StockReferenceType, StockTransferStatus } from '../generated/prisma/enums.js';
import { InventoryService, type TxClient } from '../inventory/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type {
  CreateStockTransferDto,
  ReceiveStockTransferDto,
  StockTransferItemDto,
  StockTransferQueryDto,
  UpdateStockTransferDto,
} from './dto/stock-transfer.dto.js';
import { assertUniqueProducts, createWithDocNumber } from './stock-ops.utils.js';

const SORTABLE = ['number', 'transferDate', 'status', 'createdAt'] as const;
const warehouseSelect = { select: { id: true, code: true, name: true } } as const;

const listInclude = {
  fromWarehouse: warehouseSelect,
  toWarehouse: warehouseSelect,
  _count: { select: { items: true } },
} satisfies Prisma.StockTransferInclude;

const detailInclude = {
  fromWarehouse: warehouseSelect,
  toWarehouse: warehouseSelect,
  createdBy: { select: { id: true, name: true } },
  items: {
    include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
    orderBy: { product: { sku: 'asc' } },
  },
} satisfies Prisma.StockTransferInclude;

/**
 * Transfer stok antar gudang (TRF-YYYYMMDD-XXXX).
 *
 *   DRAFT ──send──▶ SENT ──receive──▶ RECEIVED
 *     │               │
 *     └──cancel──▶ CANCELLED ◀──cancel──┘  (dari SENT: stok dikembalikan ke gudang asal)
 *
 * Barang "di jalan" (status SENT) sudah keluar dari gudang asal tapi belum masuk gudang tujuan,
 * jadi tidak tercatat di saldo gudang mana pun. Semua perubahan stok lewat InventoryService
 * dengan referenceType STOCK_TRANSFER + referenceId = id transfer.
 */
@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async findAll(query: StockTransferQueryDto) {
    const where: Prisma.StockTransferWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.warehouseId
        ? { OR: [{ fromWarehouseId: query.warehouseId }, { toWarehouseId: query.warehouseId }] }
        : {}),
      ...(query.search ? { number: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockTransfer.findMany({
        where,
        include: listInclude,
        orderBy: toOrderBy(query.sortBy, SORTABLE, 'createdAt', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  async findOne(id: string) {
    const trf = await this.prisma.stockTransfer.findUnique({ where: { id }, include: detailInclude });
    if (!trf) throw new NotFoundException('Transfer stok tidak ditemukan');
    return trf;
  }

  async create(dto: CreateStockTransferDto, user: AuthUser) {
    const { items, transferDate, ...header } = dto;
    await this.assertWarehouses(header.fromWarehouseId, header.toWarehouseId);
    await this.assertProducts(items);
    const date = transferDate ? new Date(transferDate) : new Date();
    return createWithDocNumber(
      'TRF',
      date,
      (prefix) => this.findLastNumber(prefix),
      (number) =>
        this.prisma.stockTransfer.create({
          data: {
            ...header,
            number,
            transferDate: date,
            createdById: user.id,
            items: { create: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
          },
          include: detailInclude,
        }),
    );
  }

  async update(id: string, dto: UpdateStockTransferDto) {
    const current = await this.findDraft(id);
    const { items, transferDate, ...header } = dto;
    await this.assertWarehouses(
      header.fromWarehouseId ?? current.fromWarehouseId,
      header.toWarehouseId ?? current.toWarehouseId,
    );
    if (items) await this.assertProducts(items);
    return this.prisma.$transaction(async (tx) => {
      if (items) await tx.stockTransferItem.deleteMany({ where: { stockTransferId: id } });
      return tx.stockTransfer.update({
        where: { id },
        data: {
          ...header,
          ...(transferDate ? { transferDate: new Date(transferDate) } : {}),
          ...(items
            ? { items: { create: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) } }
            : {}),
        },
        include: detailInclude,
      });
    });
  }

  /** Hapus hanya DRAFT (belum ada efek stok). */
  async remove(id: string) {
    await this.findDraft(id);
    await this.prisma.stockTransfer.delete({ where: { id } });
  }

  /**
   * Kirim: status → SENT dan stok tiap item keluar dari gudang asal.
   * Satu item kurang stok ⇒ `InsufficientStockException` (400) ⇒ seluruh transaksi rollback.
   */
  async send(id: string, user: AuthUser) {
    const current = await this.findOne(id);
    await this.assertWarehouses(current.fromWarehouseId, current.toWarehouseId);
    await this.prisma.$transaction(async (tx) => {
      const trf = await this.transition(
        tx,
        id,
        [StockTransferStatus.DRAFT],
        { status: StockTransferStatus.SENT, sentAt: new Date() },
      );
      const items = await tx.stockTransferItem.findMany({ where: { stockTransferId: id } });
      for (const item of items) {
        await this.inventory.issue(tx, {
          productId: item.productId,
          warehouseId: trf.fromWarehouseId,
          quantity: item.quantity,
          referenceType: StockReferenceType.STOCK_TRANSFER,
          referenceId: trf.id,
          note: `Transfer keluar ${trf.number} → ${current.toWarehouse.code}`,
          createdById: user.id,
        });
      }
    });
    return this.findOne(id);
  }

  /**
   * Terima: status → RECEIVED dan stok masuk ke gudang tujuan.
   * `receivedQuantity` opsional per item (default = qty kirim, maksimal qty kirim).
   * Kekurangan (kirim - terima) dianggap hilang/rusak di jalan: TIDAK dikembalikan ke gudang asal,
   * cukup terlihat di dokumen. Item dengan terima 0 tidak membuat movement.
   */
  async receive(id: string, dto: ReceiveStockTransferDto, user: AuthUser) {
    const received = new Map((dto.items ?? []).map((i) => [i.productId, i.receivedQuantity]));
    if (received.size !== (dto.items ?? []).length) {
      throw new BadRequestException('Produk yang sama tidak boleh muncul dua kali');
    }
    await this.prisma.$transaction(async (tx) => {
      const trf = await this.transition(
        tx,
        id,
        [StockTransferStatus.SENT],
        { status: StockTransferStatus.RECEIVED, receivedAt: new Date() },
      );
      const items = await tx.stockTransferItem.findMany({ where: { stockTransferId: id } });
      const known = new Set(items.map((i) => i.productId));
      for (const productId of received.keys()) {
        if (!known.has(productId)) {
          throw new BadRequestException('Ada produk yang tidak termasuk dalam transfer ini');
        }
      }
      for (const item of items) {
        const qty = received.get(item.productId) ?? item.quantity;
        if (qty > item.quantity) {
          throw new BadRequestException(
            `Qty diterima (${qty}) melebihi qty dikirim (${item.quantity})`,
          );
        }
        await tx.stockTransferItem.update({
          where: { id: item.id },
          data: { receivedQuantity: qty },
        });
        if (qty === 0) continue;
        await this.inventory.receive(tx, {
          productId: item.productId,
          warehouseId: trf.toWarehouseId,
          quantity: qty,
          referenceType: StockReferenceType.STOCK_TRANSFER,
          referenceId: trf.id,
          note:
            qty < item.quantity
              ? `Transfer masuk ${trf.number} (kurang ${item.quantity - qty} dari kiriman)`
              : `Transfer masuk ${trf.number}`,
          createdById: user.id,
        });
      }
    });
    return this.findOne(id);
  }

  /**
   * Batal dari DRAFT: tanpa efek stok.
   * Batal dari SENT: barang dianggap balik ke gudang asal ⇒ movement IN di gudang asal
   * (referensi transfer yang sama), jadi kartu stok asal: -n (kirim) lalu +n (batal).
   * RECEIVED tidak bisa dibatalkan; koreksinya bikin transfer balik.
   */
  async cancel(id: string, user: AuthUser) {
    const current = await this.prisma.stockTransfer.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Transfer stok tidak ditemukan');
    const cancellable: StockTransferStatus[] = [StockTransferStatus.DRAFT, StockTransferStatus.SENT];
    if (!cancellable.includes(current.status)) {
      throw new BadRequestException(
        `Transfer berstatus ${current.status}, aksi hanya untuk status DRAFT/SENT`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      // `from` = status yang barusan dibaca: kalau keburu berubah (mis. di-receive), transisi gagal.
      const trf = await this.transition(tx, id, [current.status], {
        status: StockTransferStatus.CANCELLED,
        cancelledAt: new Date(),
      });
      if (current.status !== StockTransferStatus.SENT) return;
      const items = await tx.stockTransferItem.findMany({ where: { stockTransferId: id } });
      for (const item of items) {
        await this.inventory.receive(tx, {
          productId: item.productId,
          warehouseId: trf.fromWarehouseId,
          quantity: item.quantity,
          referenceType: StockReferenceType.STOCK_TRANSFER,
          referenceId: trf.id,
          note: `Pembatalan transfer ${trf.number} (stok kembali)`,
          createdById: user.id,
        });
      }
    });
    return this.findOne(id);
  }

  // ---------- helper ----------

  private async findDraft(id: string) {
    const trf = await this.prisma.stockTransfer.findUnique({ where: { id } });
    if (!trf) throw new NotFoundException('Transfer stok tidak ditemukan');
    if (trf.status !== StockTransferStatus.DRAFT) {
      throw new BadRequestException('Hanya transfer berstatus DRAFT yang bisa diubah/dihapus');
    }
    return trf;
  }

  /** Pindah status atomik (`updateMany where status in from`), sama seperti PO/SO. */
  private async transition(
    tx: TxClient,
    id: string,
    from: StockTransferStatus[],
    data: Prisma.StockTransferUncheckedUpdateManyInput,
  ) {
    const { count } = await tx.stockTransfer.updateMany({
      where: { id, status: { in: from } },
      data,
    });
    const trf = await tx.stockTransfer.findUnique({ where: { id } });
    if (!trf) throw new NotFoundException('Transfer stok tidak ditemukan');
    if (count === 0) {
      throw new BadRequestException(
        `Transfer berstatus ${trf.status}, aksi hanya untuk status ${from.join('/')}`,
      );
    }
    return trf;
  }

  private async assertWarehouses(fromId: string, toId: string) {
    if (fromId === toId) {
      throw new BadRequestException('Gudang asal dan tujuan tidak boleh sama');
    }
    const found = await this.prisma.warehouse.count({
      where: { id: { in: [fromId, toId] }, isActive: true },
    });
    if (found !== 2) {
      throw new BadRequestException('Gudang asal/tujuan tidak ditemukan atau nonaktif');
    }
  }

  private async assertProducts(items: StockTransferItemDto[]) {
    const ids = items.map((i) => i.productId);
    assertUniqueProducts(ids);
    const found = await this.prisma.product.count({ where: { id: { in: ids }, isActive: true } });
    if (found !== ids.length) {
      throw new BadRequestException('Ada produk yang tidak ditemukan atau nonaktif');
    }
  }

  private async findLastNumber(prefix: string) {
    const last = await this.prisma.stockTransfer.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return last?.number;
  }
}
