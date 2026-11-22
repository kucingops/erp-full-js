import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MovementQueryDto, StockQueryDto } from './dto/inventory.dto.js';

const productSelect = { id: true, sku: true, name: true, unit: true, minStock: true } as const;
const warehouseSelect = { id: true, code: true, name: true } as const;

const STOCK_SORTABLE = ['quantity', 'updatedAt'] as const;
const MOVEMENT_SORTABLE = ['createdAt', 'quantity'] as const;

/**
 * Sisi BACA modul inventory (read model), dipisah dari InventoryService (sisi TULIS).
 * Pola CQRS sederhana: yang mengubah stok cuma satu kelas, yang membaca boleh banyak.
 */
@Injectable()
export class InventoryQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Saldo stok per produk per gudang. */
  async findStocks(query: StockQueryDto) {
    const where: Prisma.StockWhereInput = {
      warehouseId: query.warehouseId,
      productId: query.productId,
      ...(query.search ? { product: productSearch(query.search) } : {}),
    };
    if (query.lowStock) {
      // Prisma belum bisa membandingkan kolom lintas relasi (stocks.quantity <= products.min_stock),
      // jadi id-nya diambil lewat SQL mentah lalu dipakai sebagai filter.
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT s.id FROM stocks s JOIN products p ON p.id = s.product_id
        WHERE s.quantity <= p.min_stock`;
      where.id = { in: rows.map((r) => r.id) };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stock.findMany({
        where,
        include: { product: { select: productSelect }, warehouse: { select: warehouseSelect } },
        orderBy: toOrderBy(query.sortBy, STOCK_SORTABLE, 'updatedAt', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.stock.count({ where }),
    ]);
    const data = rows.map((s) => ({ ...s, isLowStock: s.quantity <= s.product.minStock }));
    return paginate(data, total, query);
  }

  /** Kartu stok: riwayat movement, terbaru dulu. */
  async findMovements(query: MovementQueryDto) {
    const where: Prisma.StockMovementWhereInput = {
      productId: query.productId,
      warehouseId: query.warehouseId,
      type: query.type,
      referenceType: query.referenceType,
      ...(query.dateFrom || query.dateTo
        ? { createdAt: { gte: query.dateFrom, lte: endOfDay(query.dateTo) } }
        : {}),
      ...(query.search ? { product: productSearch(query.search) } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: productSelect },
          warehouse: { select: warehouseSelect },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: toOrderBy(query.sortBy, MOVEMENT_SORTABLE, 'createdAt', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return paginate(rows, total, query);
  }
}

function productSearch(search: string): Prisma.ProductWhereInput {
  return {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ],
  };
}

function endOfDay(d?: Date) {
  if (!d) return undefined;
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}
