import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PurchaseOrderStatus, StockReferenceType } from '../generated/prisma/enums.js';
import { InventoryService } from '../inventory/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { docNumberPrefix, nextDocNumber } from '../common/utils/doc-number.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type {
  CreatePurchaseOrderDto,
  PurchaseOrderItemDto,
  PurchaseOrderQueryDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto.js';

const SORTABLE = ['number', 'orderDate', 'status', 'totalAmount', 'createdAt'] as const;

/** Include untuk list: cukup header + nama supplier/gudang. */
const listInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.PurchaseOrderInclude;

/** Include untuk detail: lengkap dengan item + produk + user. */
const detailInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  items: {
    include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
  },
} satisfies Prisma.PurchaseOrderInclude;

/**
 * State machine PO:
 *   DRAFT ──approve──▶ APPROVED ──receive──▶ RECEIVED (stok masuk)
 *     └──────cancel──────┴──▶ CANCELLED
 * Transisi selalu pakai `updateMany({ where: { id, status: <asal> } })` (optimistic check):
 * kalau dua request approve/receive barengan, hanya satu yang berhasil (count = 1).
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async findAll(query: PurchaseOrderQueryDto) {
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: 'insensitive' } },
              { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        include: listInclude,
        orderBy: toOrderBy(query.sortBy, SORTABLE, 'createdAt', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!po) throw new NotFoundException('Purchase order tidak ditemukan');
    return po;
  }

  async create(dto: CreatePurchaseOrderDto, user: AuthUser) {
    const { items, orderDate, ...header } = dto;
    await this.assertProductsExist(items);
    const lines = buildLines(items);
    const date = orderDate ? new Date(orderDate) : new Date();

    // Nomor dokumen bisa bentrok kalau 2 PO dibuat bersamaan → retry kalau unique violation.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.purchaseOrder.create({
          data: {
            ...header,
            number: await this.generateNumber(date),
            orderDate: date,
            createdById: user.id,
            totalAmount: sumTotal(lines),
            items: { create: lines },
          },
          include: detailInclude,
        });
      } catch (e) {
        const isDuplicateNumber =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!isDuplicateNumber || attempt >= 2) throw e;
      }
    }
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    await this.findDraft(id);
    const { items, orderDate, ...header } = dto;
    if (items) await this.assertProductsExist(items);
    const lines = items ? buildLines(items) : undefined;

    return this.prisma.$transaction(async (tx) => {
      if (lines) await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          ...header,
          ...(orderDate ? { orderDate: new Date(orderDate) } : {}),
          ...(lines ? { totalAmount: sumTotal(lines), items: { create: lines } } : {}),
        },
        include: detailInclude,
      });
    });
  }

  /** Hapus hanya untuk DRAFT. PO yang sudah diproses dibatalkan (cancel), bukan dihapus. */
  async remove(id: string) {
    await this.findDraft(id);
    await this.prisma.purchaseOrder.delete({ where: { id } });
  }

  async approve(id: string, user: AuthUser) {
    await this.transition(id, [PurchaseOrderStatus.DRAFT], {
      status: PurchaseOrderStatus.APPROVED,
      approvedById: user.id,
      approvedAt: new Date(),
    });
    return this.findOne(id);
  }

  async cancel(id: string) {
    await this.transition(id, [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.APPROVED], {
      status: PurchaseOrderStatus.CANCELLED,
    });
    return this.findOne(id);
  }

  /**
   * Terima barang: status → RECEIVED dan stok tiap item masuk ke gudang PO.
   * Semuanya dalam SATU transaksi: kalau pencatatan stok gagal, status ikut batal.
   */
  async receive(id: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const po = await this.transition(
        id,
        [PurchaseOrderStatus.APPROVED],
        { status: PurchaseOrderStatus.RECEIVED, receivedAt: new Date() },
        tx,
      );
      const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
      for (const item of items) {
        await this.inventory.receive(tx, {
          productId: item.productId,
          warehouseId: po.warehouseId,
          quantity: item.quantity,
          referenceType: StockReferenceType.PURCHASE_ORDER,
          referenceId: po.id,
          note: `Penerimaan ${po.number}`,
          createdById: user.id,
        });
      }
    });
    return this.findOne(id);
  }

  // ---------- helper ----------

  private async findDraft(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException('Purchase order tidak ditemukan');
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Hanya PO berstatus DRAFT yang bisa diubah/dihapus');
    }
    return po;
  }

  /**
   * Pindah status secara atomik. Kalau status saat ini bukan salah satu `from`,
   * lempar 404 (tidak ada) atau 400 (status tidak valid untuk aksi ini).
   */
  private async transition(
    id: string,
    from: PurchaseOrderStatus[],
    data: Prisma.PurchaseOrderUncheckedUpdateManyInput,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const { count } = await tx.purchaseOrder.updateMany({
      where: { id, status: { in: from } },
      data,
    });
    const po = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException('Purchase order tidak ditemukan');
    if (count === 0) {
      throw new BadRequestException(
        `PO berstatus ${po.status}, aksi hanya untuk status ${from.join('/')}`,
      );
    }
    return po;
  }

  private async assertProductsExist(items: PurchaseOrderItemDto[]) {
    const ids = [...new Set(items.map((i) => i.productId))];
    if (ids.length !== items.length) {
      throw new BadRequestException('Produk yang sama tidak boleh muncul dua kali');
    }
    const found = await this.prisma.product.count({ where: { id: { in: ids }, isActive: true } });
    if (found !== ids.length) {
      throw new BadRequestException('Ada produk yang tidak ditemukan atau nonaktif');
    }
  }

  private async generateNumber(date: Date) {
    const prefix = docNumberPrefix('PO', date);
    const last = await this.prisma.purchaseOrder.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return nextDocNumber(prefix, last?.number);
  }
}

/** Hitung subtotal per baris pakai Decimal (hindari error floating point uang). */
function buildLines(items: PurchaseOrderItemDto[]) {
  return items.map((i) => {
    const unitPrice = new Prisma.Decimal(i.unitPrice);
    return {
      productId: i.productId,
      quantity: i.quantity,
      unitPrice,
      subtotal: unitPrice.mul(i.quantity),
    };
  });
}

function sumTotal(lines: { subtotal: Prisma.Decimal }[]) {
  return lines.reduce((acc, l) => acc.add(l.subtotal), new Prisma.Decimal(0));
}

