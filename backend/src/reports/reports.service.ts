import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { BASE_CURRENCY } from '../currencies/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  OrderGroupBy,
  OrderReport,
  OrderReportCurrencyRow,
  OrderReportRow,
  OrderReportTotals,
  PurchaseReportQueryDto,
  SalesReportQueryDto,
  StockMovementReport,
  StockMovementReportQueryDto,
  StockMovementRow,
  StockValuationQueryDto,
  StockValuationReport,
  StockValuationRow,
} from './dto/report.dto.js';
import {
  PURCHASE_SOURCE,
  SALES_SOURCE,
  type OrderReportSource,
} from './order-report-source.js';
import { resolvePeriod, type ReportPeriod } from './report-period.js';

const { sql, join, empty } = Prisma;

/** order_date disimpan UTC (timestamp tanpa zona) -> geser ke WIB sebelum di-bucket. */
const WIB_ORDER_DATE = sql`(o.order_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')`;

/**
 * Subtotal item dalam IDR. Dibagi proporsional dari `total_amount_base` header
 * (subtotal / total_amount x total_amount_base), bukan `subtotal x exchange_rate` per item,
 * supaya jumlah semua item satu dokumen = persis total_amount_base (angka yang sama dengan
 * dashboard, tanpa selisih pembulatan per item). total_amount = SUM(subtotal).
 */
const BASE_SUBTOTAL = sql`COALESCE(i.subtotal * o.total_amount_base / NULLIF(o.total_amount, 0), 0)`;

/** Ekspresi SQL key/label/code per jenis grouping. Konstanta, bukan input user. */
const GROUP_EXPR: Record<OrderGroupBy, { key: Prisma.Sql; label: Prisma.Sql; code: Prisma.Sql }> = {
  day: {
    key: sql`to_char(${WIB_ORDER_DATE}, 'YYYY-MM-DD')`,
    label: sql`to_char(${WIB_ORDER_DATE}, 'YYYY-MM-DD')`,
    code: sql`NULL::text`,
  },
  month: {
    key: sql`to_char(${WIB_ORDER_DATE}, 'YYYY-MM')`,
    label: sql`to_char(${WIB_ORDER_DATE}, 'YYYY-MM')`,
    code: sql`NULL::text`,
  },
  partner: { key: sql`pt.id`, label: sql`pt.name`, code: sql`pt.code` },
  product: { key: sql`p.id`, label: sql`p.name`, code: sql`p.sku` },
};

interface OrderFilter {
  status?: string;
  partnerId?: string;
  productId?: string;
  warehouseId?: string;
  currencyCode?: string;
  groupBy: OrderGroupBy;
  from?: string;
  to?: string;
}

/**
 * Laporan read-only. Semua angka dihitung di database (SUM/COUNT/GROUP BY),
 * bukan di JS, supaya tidak perlu menarik ribuan baris ke memori.
 *
 * Raw SQL dipakai karena Prisma Client tidak bisa group by ekspresi (to_char tanggal WIB)
 * atau agregat FILTER. Semua nilai dari user masuk sebagai parameter (`${...}` di tagged
 * template `sql`), jadi tetap aman dari SQL injection.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  sales(q: SalesReportQueryDto, now = new Date()): Promise<OrderReport> {
    return this.orderReport(SALES_SOURCE, { ...q, partnerId: q.customerId }, now);
  }

  purchases(q: PurchaseReportQueryDto, now = new Date()): Promise<OrderReport> {
    return this.orderReport(PURCHASE_SOURCE, { ...q, partnerId: q.supplierId }, now);
  }

  /**
   * Nilai persediaan saat ini = qty stok x harga pokok (cost_price) produk.
   * Metode "standard cost": sederhana dan cukup untuk MVP (lihat docs/reports.md).
   */
  async stockValuation(q: StockValuationQueryDto, now = new Date()): Promise<StockValuationReport> {
    const where = [
      sql`TRUE`,
      q.warehouseId ? sql`s.warehouse_id = ${q.warehouseId}` : empty,
      ...this.productFilters(q),
    ].filter((f) => f !== empty);

    const rows = await this.prisma.$queryRaw<StockValuationRow[]>`
      SELECT p.id AS "productId", p.sku, p.name, p.unit, c.name AS category,
             SUM(s.quantity)::int AS quantity,
             p.cost_price::text AS "costPrice",
             (SUM(s.quantity) * p.cost_price)::numeric(15, 2)::text AS value
      FROM stocks s
      JOIN products p ON p.id = s.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ${join(where, ' AND ')}
      GROUP BY p.id, c.name
      HAVING SUM(s.quantity) <> 0
      ORDER BY SUM(s.quantity) * p.cost_price DESC, p.name ASC`;

    return {
      asOf: now.toISOString(),
      rows,
      totals: {
        quantity: rows.reduce((acc, r) => acc + r.quantity, 0),
        value: sumMoney(rows.map((r) => r.value)),
      },
    };
  }

  /**
   * Mutasi stok per produk dalam periode: saldo awal + masuk - keluar +/- penyesuaian = saldo akhir.
   * Semua dihitung dari kartu stok (`stock_movements`) dengan agregat FILTER, satu kali scan.
   * Saldo awal = jumlah semua movement sebelum periode (kartu stok append-only, jadi valid).
   */
  async stockMovements(
    q: StockMovementReportQueryDto,
    now = new Date(),
  ): Promise<StockMovementReport> {
    const period = resolvePeriod(q.from, q.to, now);
    const { start, end } = period;
    const where = [
      sql`m.created_at < ${end}`,
      q.warehouseId ? sql`m.warehouse_id = ${q.warehouseId}` : empty,
      q.productId ? sql`m.product_id = ${q.productId}` : empty,
      ...this.productFilters(q),
    ].filter((f) => f !== empty);
    const inPeriod = sql`m.created_at >= ${start}`;

    const rows = await this.prisma.$queryRaw<StockMovementRow[]>`
      SELECT p.id AS "productId", p.sku, p.name, p.unit,
             COALESCE(SUM(m.quantity) FILTER (WHERE m.created_at < ${start}), 0)::int AS opening,
             COALESCE(SUM(m.quantity) FILTER (WHERE ${inPeriod} AND m.type = 'IN'), 0)::int AS "inQty",
             COALESCE(-SUM(m.quantity) FILTER (WHERE ${inPeriod} AND m.type = 'OUT'), 0)::int AS "outQty",
             COALESCE(SUM(m.quantity) FILTER (WHERE ${inPeriod} AND m.type = 'ADJUSTMENT'), 0)::int AS adjustment,
             SUM(m.quantity)::int AS closing
      FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      WHERE ${join(where, ' AND ')}
      GROUP BY p.id
      HAVING SUM(m.quantity) <> 0 OR COUNT(*) FILTER (WHERE ${inPeriod}) > 0
      ORDER BY p.name ASC`;

    const sum = (k: keyof StockMovementReport['totals']) =>
      rows.reduce((acc, r) => acc + r[k], 0);
    return {
      from: period.from,
      to: period.to,
      rows,
      totals: {
        opening: sum('opening'),
        inQty: sum('inQty'),
        outQty: sum('outQty'),
        adjustment: sum('adjustment'),
        closing: sum('closing'),
      },
    };
  }

  // ===== private =====

  private async orderReport(
    src: OrderReportSource,
    f: OrderFilter,
    now: Date,
  ): Promise<OrderReport> {
    const period = resolvePeriod(f.from, f.to, now);
    const statuses = f.status ? [f.status] : src.countedStatuses;
    const g = GROUP_EXPR[f.groupBy];
    const from = this.orderFrom(src);
    const where = this.orderWhere(period, statuses, f);
    // Periode urut waktu; partner/produk urut omzet terbesar (yang paling penting di atas).
    const orderBy =
      f.groupBy === 'day' || f.groupBy === 'month' ? sql`1 ASC` : sql`SUM(${BASE_SUBTOTAL}) DESC, 2 ASC`;

    // Total dihitung terpisah: COUNT(DISTINCT order) tidak bisa dijumlah dari baris per produk
    // (satu dokumen bisa berisi banyak produk).
    // Uang dijumlah dalam IDR (base). totalDoc = jumlah mata uang dokumen, cuma bermakna
    // kalau semua dokumen satu mata uang (lihat docCurrency di bawah).
    const [rows, totals, currencies] = await Promise.all([
      this.prisma.$queryRaw<OrderReportRow[]>`
        SELECT ${g.key} AS key, ${g.label} AS label, ${g.code} AS code,
               COUNT(DISTINCT o.id)::int AS "orderCount",
               SUM(i.quantity)::int AS quantity,
               SUM(${BASE_SUBTOTAL})::numeric(15, 2)::text AS total,
               SUM(i.subtotal)::text AS "totalDoc"
        ${from}
        WHERE ${where}
        GROUP BY 1, 2, 3
        ORDER BY ${orderBy}`,
      this.prisma.$queryRaw<OrderReportTotals[]>`
        SELECT COUNT(DISTINCT o.id)::int AS "orderCount",
               COALESCE(SUM(i.quantity), 0)::int AS quantity,
               COALESCE(SUM(${BASE_SUBTOTAL}), 0)::numeric(15, 2)::text AS total,
               COALESCE(SUM(i.subtotal), 0)::text AS "totalDoc"
        ${from}
        WHERE ${where}`,
      this.prisma.$queryRaw<OrderReportCurrencyRow[]>`
        SELECT o.currency_code AS "currencyCode",
               COUNT(DISTINCT o.id)::int AS "orderCount",
               SUM(i.subtotal)::text AS total,
               SUM(${BASE_SUBTOTAL})::numeric(15, 2)::text AS "totalBase"
        ${from}
        WHERE ${where}
        GROUP BY 1
        ORDER BY SUM(${BASE_SUBTOTAL}) DESC, 1 ASC`,
    ]);

    return {
      from: period.from,
      to: period.to,
      groupBy: f.groupBy,
      statuses,
      baseCurrency: BASE_CURRENCY,
      docCurrency: f.currencyCode ?? (currencies.length === 1 ? currencies[0].currencyCode : null),
      rows,
      totals: totals[0] ?? { orderCount: 0, quantity: 0, total: '0', totalDoc: '0' },
      currencies,
    };
  }

  private orderFrom(src: OrderReportSource) {
    return sql`
      FROM ${src.orderTable} o
      JOIN ${src.itemTable} i ON i.${src.itemOrderFk} = o.id
      JOIN ${src.partnerTable} pt ON pt.id = o.${src.partnerFk}
      JOIN products p ON p.id = i.product_id`;
  }

  private orderWhere(period: ReportPeriod, statuses: string[], f: OrderFilter) {
    // Kolom status bertipe enum Postgres; parameter dikirim sebagai text,
    // jadi bandingkan sebagai text (`status::text`) supaya tetap bisa diparameterkan.
    const conds = [
      sql`o.order_date >= ${period.start}`,
      sql`o.order_date < ${period.end}`,
      sql`o.status::text IN (${join(statuses)})`,
      f.partnerId ? sql`pt.id = ${f.partnerId}` : empty,
      f.productId ? sql`i.product_id = ${f.productId}` : empty,
      f.warehouseId ? sql`o.warehouse_id = ${f.warehouseId}` : empty,
      f.currencyCode ? sql`o.currency_code = ${f.currencyCode}` : empty,
    ];
    return join(
      conds.filter((c) => c !== empty),
      ' AND ',
    );
  }

  /** Filter kategori & pencarian produk, dipakai dua laporan stok. Alias tabel produk: `p`. */
  private productFilters(q: { categoryId?: string; search?: string }): Prisma.Sql[] {
    const term = q.search?.trim();
    return [
      q.categoryId ? sql`p.category_id = ${q.categoryId}` : empty,
      term ? sql`(p.sku ILIKE ${`%${term}%`} OR p.name ILIKE ${`%${term}%`})` : empty,
    ];
  }
}

/**
 * Jumlahkan uang (string) pakai Decimal, bukan Number, supaya tidak ada error floating point.
 * Exported untuk unit test.
 */
export function sumMoney(values: string[]): string {
  return values
    .reduce((acc, v) => acc.add(v), new Prisma.Decimal(0))
    .toFixed(2);
}
