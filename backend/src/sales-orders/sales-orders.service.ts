import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { SalesOrderStatus, StockReferenceType } from '../generated/prisma/enums.js';
import { CurrenciesService, toBase } from '../currencies/index.js';
import { InventoryService } from '../inventory/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { docNumberPrefix, nextDocNumber } from '../common/utils/doc-number.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type {
  CreateSalesOrderDto,
  SalesOrderItemDto,
  SalesOrderQueryDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto.js';

const SORTABLE = ['number', 'orderDate', 'status', 'totalAmount', 'createdAt'] as const;

/** Include untuk list: cukup header + nama customer/gudang. */
const listInclude = {
  customer: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.SalesOrderInclude;

/** Include untuk detail: lengkap dengan item + produk + user. */
const detailInclude = {
  customer: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
  },
} satisfies Prisma.SalesOrderInclude;

/**
 * State machine SO:
 *   DRAFT ──confirm──▶ CONFIRMED ──ship──▶ SHIPPED (stok keluar)
 *     └──────cancel──────┴──▶ CANCELLED
 * Transisi selalu pakai `updateMany({ where: { id, status: <asal> } })` (optimistic check):
 * kalau dua request confirm/ship barengan, hanya satu yang berhasil (count = 1).
 */
@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly currencies: CurrenciesService,
  ) {}

  async findAll(query: SalesOrderQueryDto) {
    const where: Prisma.SalesOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: 'insensitive' } },
              { customer: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        include: listInclude,
        orderBy: toOrderBy(query.sortBy, SORTABLE, 'createdAt', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  async findOne(id: string) {
    const so = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!so) throw new NotFoundException('Sales order tidak ditemukan');
    return so;
  }

  async create(dto: CreateSalesOrderDto, user: AuthUser) {
    const { items, orderDate, currencyCode, exchangeRate, ...header } = dto;
    await this.assertProductsExist(items);
    const lines = buildLines(items);
    const date = orderDate ? new Date(orderDate) : new Date();
    // Multi-currency: mata uang dokumen → default customer → IDR; kurs di-snapshot per tanggal order.
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      select: { currencyCode: true },
    });
    const currency = await this.currencies.snapshot({
      requested: currencyCode,
      partnerDefault: customer?.currencyCode,
      date,
      override: exchangeRate,
    });
    const total = sumTotal(lines);

    // Nomor dokumen bisa bentrok kalau 2 SO dibuat bersamaan → retry kalau unique violation.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.salesOrder.create({
          data: {
            ...header,
            number: await this.generateNumber(date),
            orderDate: date,
            createdById: user.id,
            totalAmount: total,
            ...currency,
            totalAmountBase: toBase(total, currency.exchangeRate),
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

  async update(id: string, dto: UpdateSalesOrderDto) {
    const current = await this.findDraft(id);
    const { items, orderDate, currencyCode, exchangeRate, ...header } = dto;
    if (items) await this.assertProductsExist(items);
    const lines = items ? buildLines(items) : undefined;
    // Selama DRAFT kurs dihitung ulang kalau mata uang/tanggal berubah (atau kurs manual dikirim).
    const date = orderDate ? new Date(orderDate) : current.orderDate;
    const code = currencyCode ?? current.currencyCode;
    const keepRate = !orderDate && code === current.currencyCode && exchangeRate == null;
    const currency = keepRate
      ? { currencyCode: code, exchangeRate: new Prisma.Decimal(current.exchangeRate) }
      : await this.currencies.snapshot({ requested: code, date, override: exchangeRate });
    const total = lines ? sumTotal(lines) : new Prisma.Decimal(current.totalAmount);

    return this.prisma.$transaction(async (tx) => {
      if (lines) await tx.salesOrderItem.deleteMany({ where: { salesOrderId: id } });
      return tx.salesOrder.update({
        where: { id },
        data: {
          ...header,
          ...(orderDate ? { orderDate: new Date(orderDate) } : {}),
          ...(lines ? { totalAmount: total, items: { create: lines } } : {}),
          ...currency,
          totalAmountBase: toBase(total, currency.exchangeRate),
        },
        include: detailInclude,
      });
    });
  }

  /** Hapus hanya untuk DRAFT. SO yang sudah diproses dibatalkan (cancel), bukan dihapus. */
  async remove(id: string) {
    await this.findDraft(id);
    await this.prisma.salesOrder.delete({ where: { id } });
  }

  /**
   * Konfirmasi SO: DRAFT → CONFIRMED. Stok dicek dulu supaya sales tahu lebih awal
   * kalau barang kurang. Catatan: confirm TIDAK me-reserve stok (MVP), jadi cek final
   * tetap terjadi saat ship di `InventoryService.issue`.
   */
  async confirm(id: string) {
    const so = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { sku: true } } } } },
    });
    if (!so) throw new NotFoundException('Sales order tidak ditemukan');
    if (so.status === SalesOrderStatus.DRAFT) {
      await this.assertStockAvailable(so.warehouseId, so.items);
    }
    await this.transition(id, [SalesOrderStatus.DRAFT], {
      status: SalesOrderStatus.CONFIRMED,
      confirmedAt: new Date(),
    });
    return this.findOne(id);
  }

  async cancel(id: string) {
    await this.transition(id, [SalesOrderStatus.DRAFT, SalesOrderStatus.CONFIRMED], {
      status: SalesOrderStatus.CANCELLED,
    });
    return this.findOne(id);
  }

  /**
   * Kirim barang: status → SHIPPED dan stok tiap item keluar dari gudang SO.
   * Semuanya dalam SATU transaksi: kalau satu item stoknya kurang
   * (`InsufficientStockException`, HTTP 400), semua perubahan stok & status di-rollback.
   */
  async ship(id: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const so = await this.transition(
        id,
        [SalesOrderStatus.CONFIRMED],
        { status: SalesOrderStatus.SHIPPED, shippedAt: new Date() },
        tx,
      );
      const items = await tx.salesOrderItem.findMany({ where: { salesOrderId: id } });
      for (const item of items) {
        await this.inventory.issue(tx, {
          productId: item.productId,
          warehouseId: so.warehouseId,
          quantity: item.quantity,
          referenceType: StockReferenceType.SALES_ORDER,
          referenceId: so.id,
          note: `Pengiriman ${so.number}`,
          createdById: user.id,
        });
      }
    });
    return this.findOne(id);
  }

  // ---------- helper ----------

  private async findDraft(id: string) {
    const so = await this.prisma.salesOrder.findUnique({ where: { id } });
    if (!so) throw new NotFoundException('Sales order tidak ditemukan');
    if (so.status !== SalesOrderStatus.DRAFT) {
      throw new BadRequestException('Hanya SO berstatus DRAFT yang bisa diubah/dihapus');
    }
    return so;
  }

  /**
   * Pindah status secara atomik. Kalau status saat ini bukan salah satu `from`,
   * lempar 404 (tidak ada) atau 400 (status tidak valid untuk aksi ini).
   */
  private async transition(
    id: string,
    from: SalesOrderStatus[],
    data: Prisma.SalesOrderUncheckedUpdateManyInput,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const { count } = await tx.salesOrder.updateMany({
      where: { id, status: { in: from } },
      data,
    });
    const so = await tx.salesOrder.findUnique({ where: { id } });
    if (!so) throw new NotFoundException('Sales order tidak ditemukan');
    if (count === 0) {
      throw new BadRequestException(
        `SO berstatus ${so.status}, aksi hanya untuk status ${from.join('/')}`,
      );
    }
    return so;
  }

  /** Cek awal stok semua item sekaligus, supaya pesan error menyebut semua produk yang kurang. */
  private async assertStockAvailable(
    warehouseId: string,
    items: { productId: string; quantity: number; product: { sku: string } }[],
  ) {
    const shortages: string[] = [];
    for (const item of items) {
      const available = await this.inventory.getQuantity(item.productId, warehouseId);
      if (available < item.quantity) {
        shortages.push(`${item.product.sku} (diminta ${item.quantity}, tersedia ${available})`);
      }
    }
    if (shortages.length > 0) {
      throw new BadRequestException(`Stok tidak cukup: ${shortages.join('; ')}`);
    }
  }

  private async assertProductsExist(items: SalesOrderItemDto[]) {
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
    const prefix = docNumberPrefix('SO', date);
    const last = await this.prisma.salesOrder.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return nextDocNumber(prefix, last?.number);
  }
}

/** Hitung subtotal per baris pakai Decimal (hindari error floating point uang). */
function buildLines(items: SalesOrderItemDto[]) {
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
