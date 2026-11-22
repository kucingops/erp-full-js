import { Injectable } from '@nestjs/common';
import {
  PurchaseOrderStatus,
  SalesOrderStatus,
  type Role,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { dashboardScope } from './dashboard-scope.js';
import type {
  DashboardSummary,
  LowStockItem,
  OrderKpi,
  TrendPoint,
} from './dto/dashboard.dto.js';
import { fillMonths, lastMonthKeys, monthKey, monthStart } from './month-buckets.js';

/** Dokumen yang dihitung sebagai omzet/belanja: yang draft & batal tidak dihitung. */
const SALES_COUNTED = [SalesOrderStatus.CONFIRMED, SalesOrderStatus.SHIPPED];
const PURCHASE_COUNTED = [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.RECEIVED];

interface MonthRow {
  month: string;
  total: string;
  count: number;
}

/**
 * Service read-only untuk dashboard. Tidak ada tulis sama sekali,
 * jadi cukup query agregat (aggregate/groupBy/count) dan sedikit raw SQL
 * untuk hal yang tidak bisa diekspresikan Prisma Client (group by bulan, HAVING vs kolom).
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(role: Role, now = new Date()): Promise<DashboardSummary> {
    const scope = dashboardScope(role);
    const range = {
      thisMonth: { gte: monthStart(now), lt: monthStart(now, 1) },
      lastMonth: { gte: monthStart(now, -1), lt: monthStart(now) },
    };

    const [sales, purchases, lowStock, products, warehouses, customers, suppliers, users] =
      await Promise.all([
        scope.sales ? this.salesKpi(range) : null,
        scope.purchases ? this.purchaseKpi(range) : null,
        scope.inventory ? this.queryLowStock(1) : null,
        this.prisma.product.count({ where: { isActive: true } }),
        this.prisma.warehouse.count({ where: { isActive: true } }),
        scope.customers ? this.prisma.customer.count({ where: { isActive: true } }) : null,
        scope.suppliers ? this.prisma.supplier.count({ where: { isActive: true } }) : null,
        scope.users ? this.prisma.user.count({ where: { isActive: true } }) : null,
      ]);

    return {
      month: monthKey(now),
      sales,
      purchases,
      inventory: lowStock ? { lowStockCount: lowStock.total } : null,
      counts: { products, warehouses, customers, suppliers, users },
    };
  }

  /** Total per bulan untuk chart. Field sales/purchases hanya muncul kalau role boleh lihat. */
  async trend(role: Role, months: number, now = new Date()): Promise<TrendPoint[]> {
    const scope = dashboardScope(role);
    const keys = lastMonthKeys(now, months);
    const from = monthStart(now, -(months - 1));

    const [sales, purchases] = await Promise.all([
      scope.sales ? this.salesByMonth(from) : null,
      scope.purchases ? this.purchasesByMonth(from) : null,
    ]);
    const empty = { total: '0', count: 0 };
    const salesRows = sales && fillMonths<MonthRow>(keys, sales, empty);
    const purchaseRows = purchases && fillMonths<MonthRow>(keys, purchases, empty);

    return keys.map((month, i) => ({
      month,
      ...(salesRows && { sales: salesRows[i].total, salesCount: salesRows[i].count }),
      ...(purchaseRows && {
        purchases: purchaseRows[i].total,
        purchasesCount: purchaseRows[i].count,
      }),
    }));
  }

  async lowStock(limit: number): Promise<LowStockItem[]> {
    return (await this.queryLowStock(limit)).items;
  }

  // ===== private =====

  private async salesKpi(range: DateRanges): Promise<OrderKpi> {
    const where = { status: { in: SALES_COUNTED } };
    const [cur, prev, byStatus] = await Promise.all([
      this.prisma.salesOrder.aggregate({
        where: { ...where, orderDate: range.thisMonth },
        _sum: { totalAmountBase: true },
        _count: true,
      }),
      this.prisma.salesOrder.aggregate({
        where: { ...where, orderDate: range.lastMonth },
        _sum: { totalAmountBase: true },
      }),
      this.prisma.salesOrder.groupBy({ by: ['status'], _count: true }),
    ]);
    return toKpi(cur, prev, byStatus, Object.values(SalesOrderStatus));
  }

  private async purchaseKpi(range: DateRanges): Promise<OrderKpi> {
    const where = { status: { in: PURCHASE_COUNTED } };
    const [cur, prev, byStatus] = await Promise.all([
      this.prisma.purchaseOrder.aggregate({
        where: { ...where, orderDate: range.thisMonth },
        _sum: { totalAmountBase: true },
        _count: true,
      }),
      this.prisma.purchaseOrder.aggregate({
        where: { ...where, orderDate: range.lastMonth },
        _sum: { totalAmountBase: true },
      }),
      this.prisma.purchaseOrder.groupBy({ by: ['status'], _count: true }),
    ]);
    return toKpi(cur, prev, byStatus, Object.values(PurchaseOrderStatus));
  }

  // Status ditulis literal (bukan parameter) karena kolomnya tipe enum Postgres:
  // parameter dikirim sebagai text dan `enum = text` ditolak Postgres.
  // `order_date` disimpan UTC (timestamp tanpa zona), dikonversi ke WIB sebelum di-bucket.
  private salesByMonth(from: Date) {
    return this.prisma.$queryRaw<MonthRow[]>`
      SELECT to_char(order_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS month,
             SUM(total_amount_base)::text AS total,
             COUNT(*)::int AS count
      FROM sales_orders
      WHERE status IN ('CONFIRMED', 'SHIPPED') AND order_date >= ${from}
      GROUP BY 1`;
  }

  private purchasesByMonth(from: Date) {
    return this.prisma.$queryRaw<MonthRow[]>`
      SELECT to_char(order_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS month,
             SUM(total_amount_base)::text AS total,
             COUNT(*)::int AS count
      FROM purchase_orders
      WHERE status IN ('APPROVED', 'RECEIVED') AND order_date >= ${from}
      GROUP BY 1`;
  }

  /**
   * Produk aktif yang total stoknya (semua gudang) <= minStock.
   * Produk tanpa baris stok dihitung 0. `COUNT(*) OVER()` = total baris sebelum LIMIT,
   * jadi list + jumlahnya cukup satu query.
   */
  private async queryLowStock(limit: number) {
    const rows = await this.prisma.$queryRaw<(LowStockItem & { totalCount: number })[]>`
      SELECT p.id, p.sku, p.name, p.unit,
             p.min_stock AS "minStock",
             COALESCE(SUM(s.quantity), 0)::int AS "totalStock",
             COUNT(*) OVER ()::int AS "totalCount"
      FROM products p
      LEFT JOIN stocks s ON s.product_id = p.id
      WHERE p.is_active AND p.min_stock > 0
      GROUP BY p.id
      HAVING COALESCE(SUM(s.quantity), 0) <= p.min_stock
      ORDER BY COALESCE(SUM(s.quantity), 0) - p.min_stock ASC, p.name ASC
      LIMIT ${limit}`;
    return {
      total: rows[0]?.totalCount ?? 0,
      items: rows.map((row) => {
        const { totalCount, ...item } = row;
        void totalCount;
        return item;
      }),
    };
  }
}

interface DateRanges {
  thisMonth: { gte: Date; lt: Date };
  lastMonth: { gte: Date; lt: Date };
}

type Sum = { _sum: { totalAmountBase: { toString(): string } | null } };

function toKpi(
  cur: Sum & { _count: number },
  prev: Sum,
  byStatus: { status: string; _count: number }[],
  allStatuses: string[],
): OrderKpi {
  return {
    total: cur._sum.totalAmountBase?.toString() ?? '0',
    previousTotal: prev._sum.totalAmountBase?.toString() ?? '0',
    orderCount: cur._count,
    byStatus: Object.fromEntries(
      allStatuses.map((s) => [s, byStatus.find((r) => r.status === s)?._count ?? 0]),
    ),
  };
}
