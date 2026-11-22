// Tipe response /api/purchase-orders. Uang (Decimal) datang sebagai string → parse dengan Number().

export type PurchaseOrderStatus = "DRAFT" | "APPROVED" | "RECEIVED" | "CANCELLED";

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Disetujui",
  RECEIVED: "Diterima",
  CANCELLED: "Dibatalkan",
};

interface Ref {
  id: string;
  code: string;
  name: string;
}

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  product: { id: string; sku: string; name: string; unit: string };
}

export interface PurchaseOrder {
  id: string;
  number: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  notes: string | null;
  totalAmount: string;
  /** Multi-currency: totalAmount dalam currencyCode; totalAmountBase dalam IDR. */
  currencyCode: string;
  exchangeRate: string;
  totalAmountBase: string;
  supplierId: string;
  warehouseId: string;
  supplier: Ref;
  warehouse: Ref;
  approvedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  _count?: { items: number };
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  items: PurchaseOrderItem[];
  createdBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
}
