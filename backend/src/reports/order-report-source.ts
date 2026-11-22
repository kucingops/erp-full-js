import { Prisma } from '../generated/prisma/client.js';
import {
  PurchaseOrderStatus,
  SalesOrderStatus,
} from '../generated/prisma/enums.js';

/**
 * Laporan penjualan & pembelian bentuknya sama persis: header dokumen + item + partner.
 * Bedanya cuma nama tabel/kolom dan status yang dihitung. Jadi satu query builder
 * dipakai dua-duanya, dikonfigurasi lewat objek "source" ini.
 *
 * Mirip Strategy/Template Method di Java: algoritmanya satu (ReportsService.orderReport),
 * detail yang berubah dipisah ke objek konfigurasi. Bedanya di TS cukup object literal
 * yang memenuhi interface, tidak perlu bikin class turunan.
 *
 * Identifier SQL (nama tabel/kolom) tidak bisa jadi parameter `$1`, jadi pakai
 * `Prisma.raw`. Aman karena nilainya konstanta di file ini, bukan input user.
 */
export interface OrderReportSource {
  orderTable: Prisma.Sql;
  itemTable: Prisma.Sql;
  /** kolom FK item -> header */
  itemOrderFk: Prisma.Sql;
  partnerTable: Prisma.Sql;
  /** kolom FK header -> partner */
  partnerFk: Prisma.Sql;
  /** status default yang dihitung kalau user tidak memilih status */
  countedStatuses: string[];
}

export const SALES_SOURCE: OrderReportSource = {
  orderTable: Prisma.raw('sales_orders'),
  itemTable: Prisma.raw('sales_order_items'),
  itemOrderFk: Prisma.raw('sales_order_id'),
  partnerTable: Prisma.raw('customers'),
  partnerFk: Prisma.raw('customer_id'),
  countedStatuses: [SalesOrderStatus.CONFIRMED, SalesOrderStatus.SHIPPED],
};

export const PURCHASE_SOURCE: OrderReportSource = {
  orderTable: Prisma.raw('purchase_orders'),
  itemTable: Prisma.raw('purchase_order_items'),
  itemOrderFk: Prisma.raw('purchase_order_id'),
  partnerTable: Prisma.raw('suppliers'),
  partnerFk: Prisma.raw('supplier_id'),
  countedStatuses: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.RECEIVED],
};
