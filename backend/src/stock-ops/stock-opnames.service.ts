import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { StockOpnameStatus, StockReferenceType } from '../generated/prisma/enums.js';
import { InventoryService, type TxClient } from '../inventory/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type {
  CreateStockOpnameDto,
  StockOpnameQueryDto,
  UpdateStockOpnameDto,
} from './dto/stock-opname.dto.js';
import { assertUniqueProducts, createWithDocNumber } from './stock-ops.utils.js';

const SORTABLE = ['number', 'snapshotAt', 'status', 'createdAt'] as const;
const warehouseSelect = { select: { id: true, code: true, name: true } } as const;

const listInclude = {
  warehouse: warehouseSelect,
  _count: { select: { lines: true } },
} satisfies Prisma.StockOpnameInclude;

const detailInclude = {
  warehouse: warehouseSelect,
  createdBy: { select: { id: true, name: true } },
  lines: {
    include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
    orderBy: { product: { sku: 'asc' } },
  },
} satisfies Prisma.StockOpnameInclude;

/**
 * Stock opname / stock count (OPN-YYYYMMDD-XXXX), satu dokumen per gudang.
 *
 *   DRAFT ──post──▶ POSTED   (selisih ≠ 0 dibukukan sebagai movement ADJUSTMENT)
 *     └──cancel──▶ CANCELLED
 *
 * Aturan cut-off: hitung fisik dianggap terjadi TEPAT saat snapshot. Saat post, yang dibukukan
 * adalah variance = counted - systemQty(snapshot) sebagai DELTA terhadap saldo saat ini.
 * Jadi transaksi yang terjadi setelah snapshot (PO receive, SO ship, transfer) tetap dihormati,
 * tidak "tertimpa" oleh angka hitungan. Detail: docs/stock-transfer-opname.md.
 */
@Injectable()
export class StockOpnamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async findAll(query: StockOpnameQueryDto) {
    const where: Prisma.StockOpnameWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.search ? { number: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockOpname.findMany({
        where,
        include: listInclude,
        orderBy: toOrderBy(query.sortBy, SORTABLE, 'createdAt', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.stockOpname.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  /**
   * Detail + `currentQty` per baris (saldo sistem sekarang) selama DRAFT, supaya FE bisa
   * kasih tanda "stok sudah bergerak sejak snapshot". Untuk POSTED pakai `qtyAtPost`.
   */
  async findOne(id: string) {
    const opn = await this.prisma.stockOpname.findUnique({ where: { id }, include: detailInclude });
    if (!opn) throw new NotFoundException('Stock opname tidak ditemukan');
    if (opn.status !== StockOpnameStatus.DRAFT) {
      return { ...opn, lines: opn.lines.map((l) => ({ ...l, currentQty: null })) };
    }
    const stocks = await this.prisma.stock.findMany({
      where: { warehouseId: opn.warehouseId, productId: { in: opn.lines.map((l) => l.productId) } },
      select: { productId: true, quantity: true },
    });
    const qty = new Map(stocks.map((s) => [s.productId, s.quantity]));
    return {
      ...opn,
      lines: opn.lines.map((l) => ({ ...l, currentQty: qty.get(l.productId) ?? 0 })),
    };
  }

  /** Buat lembar hitung: snapshot qty sistem semua produk (atau terpilih/per kategori) di gudang. */
  async create(dto: CreateStockOpnameDto, user: AuthUser) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
      select: { isActive: true },
    });
    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');
    if (!warehouse.isActive) throw new BadRequestException('Gudang sudah nonaktif');
    if (dto.productIds) assertUniqueProducts(dto.productIds);

    // Satu gudang cuma boleh punya satu opname DRAFT: dua lembar hitung paralel di gudang
    // yang sama bisa membukukan selisih yang sama dua kali.
    const openDraft = await this.prisma.stockOpname.findFirst({
      where: { warehouseId: dto.warehouseId, status: StockOpnameStatus.DRAFT },
      select: { number: true },
    });
    if (openDraft) {
      throw new ConflictException(
        `Gudang ini masih punya opname DRAFT (${openDraft.number}). Post atau batalkan dulu.`,
      );
    }

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        ...(dto.productIds ? { id: { in: dto.productIds } } : {}),
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
      },
      select: { id: true },
      orderBy: { sku: 'asc' },
    });
    if (dto.productIds && products.length !== dto.productIds.length) {
      throw new BadRequestException('Ada produk yang tidak ditemukan, nonaktif, atau beda kategori');
    }
    if (products.length === 0) {
      throw new BadRequestException('Tidak ada produk aktif untuk dihitung');
    }

    const now = new Date();
    return createWithDocNumber(
      'OPN',
      now,
      (prefix) => this.findLastNumber(prefix),
      (number) =>
        // Snapshot saldo + simpan dokumen dalam satu transaksi supaya snapshotAt konsisten.
        this.prisma.$transaction(async (tx) => {
          const stocks = await tx.stock.findMany({
            where: { warehouseId: dto.warehouseId, productId: { in: products.map((p) => p.id) } },
            select: { productId: true, quantity: true },
          });
          const qty = new Map(stocks.map((s) => [s.productId, s.quantity]));
          const created = await tx.stockOpname.create({
            data: {
              number,
              warehouseId: dto.warehouseId,
              notes: dto.notes,
              snapshotAt: now,
              createdById: user.id,
              lines: {
                create: products.map((p) => ({ productId: p.id, systemQty: qty.get(p.id) ?? 0 })),
              },
            },
            select: { id: true },
          });
          return created;
        }),
    ).then((created) => this.findOne(created.id));
  }

  /** Isi hasil hitung (counted qty) dan/atau catatan. Hanya DRAFT. */
  async update(id: string, dto: UpdateStockOpnameDto) {
    await this.findDraft(id);
    const lines = dto.lines ?? [];
    assertUniqueProducts(lines.map((l) => l.productId));
    await this.prisma.$transaction(async (tx) => {
      if (dto.notes !== undefined) {
        await tx.stockOpname.update({ where: { id }, data: { notes: dto.notes } });
      }
      for (const line of lines) {
        const { count } = await tx.stockOpnameLine.updateMany({
          where: { stockOpnameId: id, productId: line.productId },
          data: { countedQty: line.countedQty },
        });
        if (count === 0) {
          throw new BadRequestException('Ada produk yang tidak ada di lembar hitung ini');
        }
      }
    });
    return this.findOne(id);
  }

  /**
   * Post: semua baris wajib sudah dihitung. Untuk tiap variance ≠ 0 dibuat movement ADJUSTMENT
   * (referenceType STOCK_OPNAME) sebesar variance terhadap saldo SAAT INI.
   * Kalau variance negatif lebih besar dari saldo sekarang (stok keburu keluar setelah snapshot),
   * InventoryService menolak (400) dan seluruh post rollback: opname harus dibatalkan & diulang.
   */
  async post(id: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const opn = await this.transition(tx, id, [StockOpnameStatus.DRAFT], {
        status: StockOpnameStatus.POSTED,
        postedAt: new Date(),
      });
      const lines = await tx.stockOpnameLine.findMany({ where: { stockOpnameId: id } });
      const uncounted = lines.filter((l) => l.countedQty === null).length;
      if (uncounted > 0) {
        throw new BadRequestException(`Masih ada ${uncounted} produk yang belum dihitung`);
      }
      for (const line of lines) {
        const counted = line.countedQty as number;
        const variance = counted - line.systemQty;
        const qtyAtPost = await this.inventory.getQuantity(line.productId, opn.warehouseId, tx);
        if (variance !== 0) {
          await this.inventory.adjust(tx, {
            productId: line.productId,
            warehouseId: opn.warehouseId,
            quantity: variance,
            referenceType: StockReferenceType.STOCK_OPNAME,
            referenceId: opn.id,
            note: `Stock opname ${opn.number}: hitung ${counted}, sistem ${line.systemQty}`,
            createdById: user.id,
          });
        }
        await tx.stockOpnameLine.update({
          where: { id: line.id },
          data: { variance, qtyAtPost },
        });
      }
    });
    return this.findOne(id);
  }

  async cancel(id: string) {
    await this.transition(this.prisma, id, [StockOpnameStatus.DRAFT], {
      status: StockOpnameStatus.CANCELLED,
      cancelledAt: new Date(),
    });
    return this.findOne(id);
  }

  // ---------- helper ----------

  private async findDraft(id: string) {
    const opn = await this.prisma.stockOpname.findUnique({ where: { id } });
    if (!opn) throw new NotFoundException('Stock opname tidak ditemukan');
    if (opn.status !== StockOpnameStatus.DRAFT) {
      throw new BadRequestException('Hanya opname berstatus DRAFT yang bisa diubah');
    }
    return opn;
  }

  private async transition(
    tx: TxClient,
    id: string,
    from: StockOpnameStatus[],
    data: Prisma.StockOpnameUncheckedUpdateManyInput,
  ) {
    const { count } = await tx.stockOpname.updateMany({
      where: { id, status: { in: from } },
      data,
    });
    const opn = await tx.stockOpname.findUnique({ where: { id } });
    if (!opn) throw new NotFoundException('Stock opname tidak ditemukan');
    if (count === 0) {
      throw new BadRequestException(
        `Opname berstatus ${opn.status}, aksi hanya untuk status ${from.join('/')}`,
      );
    }
    return opn;
  }

  private async findLastNumber(prefix: string) {
    const last = await this.prisma.stockOpname.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return last?.number;
  }
}
