// Tipe response /api/stock-transfers dan /api/stock-opnames (lihat backend/src/stock-ops).

export type StockTransferStatus = "DRAFT" | "SENT" | "RECEIVED" | "CANCELLED";
export type StockOpnameStatus = "DRAFT" | "POSTED" | "CANCELLED";

export const TRANSFER_STATUS_LABEL: Record<StockTransferStatus, string> = {
  DRAFT: "Draft",
  SENT: "Dikirim",
  RECEIVED: "Diterima",
  CANCELLED: "Dibatalkan",
};

export const OPNAME_STATUS_LABEL: Record<StockOpnameStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Diposting",
  CANCELLED: "Dibatalkan",
};

interface WarehouseRef {
  id: string;
  code: string;
  name: string;
}

interface ProductRef {
  id: string;
  sku: string;
  name: string;
  unit: string;
}

export interface StockTransfer {
  id: string;
  number: string;
  status: StockTransferStatus;
  transferDate: string;
  notes: string | null;
  fromWarehouseId: string;
  toWarehouseId: string;
  fromWarehouse: WarehouseRef;
  toWarehouse: WarehouseRef;
  sentAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  _count?: { items: number };
}

export interface StockTransferItem {
  id: string;
  productId: string;
  quantity: number;
  /** null sampai transfer diterima */
  receivedQuantity: number | null;
  product: ProductRef;
}

export interface StockTransferDetail extends StockTransfer {
  items: StockTransferItem[];
  createdBy: { id: string; name: string };
}

export interface StockOpname {
  id: string;
  number: string;
  status: StockOpnameStatus;
  warehouseId: string;
  warehouse: WarehouseRef;
  snapshotAt: string;
  notes: string | null;
  postedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  _count?: { lines: number };
}

export interface StockOpnameLine {
  id: string;
  productId: string;
  /** Qty sistem saat snapshot */
  systemQty: number;
  countedQty: number | null;
  /** Diisi saat post */
  variance: number | null;
  /** Saldo sistem tepat sebelum adjustment (saat post) */
  qtyAtPost: number | null;
  /** Saldo sistem sekarang (hanya untuk DRAFT, null kalau sudah tidak DRAFT) */
  currentQty: number | null;
  product: ProductRef;
}

export interface StockOpnameDetail extends StockOpname {
  lines: StockOpnameLine[];
  createdBy: { id: string; name: string };
}
