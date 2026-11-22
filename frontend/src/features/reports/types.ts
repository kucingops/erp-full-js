// Bentuk response endpoint /api/reports/* (uang = string dari Decimal).

export type OrderGroupBy = "day" | "month" | "partner" | "product";
export type ExportFormat = "csv" | "xlsx";

export interface OrderReportRow {
  key: string;
  label: string;
  code: string | null;
  orderCount: number;
  quantity: number;
  total: string;
}

export interface OrderReport {
  from: string;
  to: string;
  groupBy: OrderGroupBy;
  statuses: string[];
  rows: OrderReportRow[];
  totals: { orderCount: number; quantity: number; total: string };
}

export interface StockValuationRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  category: string | null;
  quantity: number;
  costPrice: string;
  value: string;
}

export interface StockValuationReport {
  asOf: string;
  rows: StockValuationRow[];
  totals: { quantity: number; value: string };
}

export interface StockMovementRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  opening: number;
  inQty: number;
  outQty: number;
  adjustment: number;
  closing: number;
}

export interface StockMovementReport {
  from: string;
  to: string;
  rows: StockMovementRow[];
  totals: Omit<StockMovementRow, "productId" | "sku" | "name" | "unit">;
}
