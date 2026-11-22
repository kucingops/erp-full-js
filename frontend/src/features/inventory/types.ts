// Tipe response modul inventory (lihat backend/src/inventory).

export type StockMovementType = "IN" | "OUT" | "ADJUSTMENT";
export type StockReferenceType =
  | "PURCHASE_ORDER"
  | "SALES_ORDER"
  | "ADJUSTMENT"
  | "STOCK_TRANSFER"
  | "STOCK_OPNAME";

export const MOVEMENT_TYPE_LABEL: Record<StockMovementType, string> = {
  IN: "Masuk",
  OUT: "Keluar",
  ADJUSTMENT: "Penyesuaian",
};

export const REFERENCE_TYPE_LABEL: Record<StockReferenceType, string> = {
  PURCHASE_ORDER: "Purchase Order",
  SALES_ORDER: "Sales Order",
  ADJUSTMENT: "Adjustment",
  STOCK_TRANSFER: "Transfer Stok",
  STOCK_OPNAME: "Stock Opname",
};

/** Ringkasan produk/gudang yang di-include backend. */
export interface ProductRef {
  id: string;
  sku: string;
  name: string;
  unit: string;
  minStock: number;
}

export interface WarehouseRef {
  id: string;
  code: string;
  name: string;
}

export interface Stock {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  updatedAt: string;
  isLowStock: boolean;
  product: ProductRef;
  warehouse: WarehouseRef;
}

export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  /** Positif = masuk, negatif = keluar */
  quantity: number;
  balanceAfter: number;
  referenceType: StockReferenceType;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
  product: ProductRef;
  warehouse: WarehouseRef;
  createdBy: { id: string; name: string } | null;
}
