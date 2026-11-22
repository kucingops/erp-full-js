// Cermin response /api/dashboard/* (lihat backend/src/dashboard/dto/dashboard.dto.ts).
// Uang dikirim sebagai string (Decimal), parse dengan Number() saat tampil.

export interface OrderKpi {
  total: string;
  previousTotal: string;
  orderCount: number;
  byStatus: Record<string, number>;
}

export interface DashboardSummary {
  month: string;
  /** null = role tidak boleh lihat bagian ini */
  sales: OrderKpi | null;
  purchases: OrderKpi | null;
  inventory: { lowStockCount: number } | null;
  counts: {
    products: number;
    warehouses: number;
    customers: number | null;
    suppliers: number | null;
    users: number | null;
  };
}

export interface TrendPoint {
  month: string;
  sales?: string;
  salesCount?: number;
  purchases?: string;
  purchasesCount?: number;
}

export interface LowStockItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  minStock: number;
  totalStock: number;
}
