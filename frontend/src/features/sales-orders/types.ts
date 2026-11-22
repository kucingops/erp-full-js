// Tipe response /api/sales-orders. Uang (Decimal) datang sebagai string → parse dengan Number().

export type SalesOrderStatus = "DRAFT" | "CONFIRMED" | "SHIPPED" | "CANCELLED";

export const SO_STATUS_LABEL: Record<SalesOrderStatus, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Dikonfirmasi",
  SHIPPED: "Dikirim",
  CANCELLED: "Dibatalkan",
};

interface Ref {
  id: string;
  code: string;
  name: string;
}

export interface SalesOrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  product: { id: string; sku: string; name: string; unit: string };
}

export interface SalesOrder {
  id: string;
  number: string;
  status: SalesOrderStatus;
  orderDate: string;
  notes: string | null;
  totalAmount: string;
  /** Multi-currency: totalAmount dalam currencyCode; totalAmountBase dalam IDR. */
  currencyCode: string;
  exchangeRate: string;
  totalAmountBase: string;
  customerId: string;
  warehouseId: string;
  customer: Ref;
  warehouse: Ref;
  confirmedAt: string | null;
  shippedAt: string | null;
  createdAt: string;
  _count?: { items: number };
}

export interface SalesOrderDetail extends SalesOrder {
  items: SalesOrderItem[];
  createdBy: { id: string; name: string };
}
