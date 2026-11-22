import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class TrendQueryDto {
  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 24, description: 'Jumlah bulan ke belakang (termasuk bulan ini)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months: number = 6;
}

export class LowStockQueryDto {
  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 5;
}

// ===== Bentuk response (uang = string, sama seperti Decimal di endpoint lain) =====

export interface OrderKpi {
  /** total bulan ini (hanya dokumen yang sudah dikonfirmasi/di-approve) */
  total: string;
  previousTotal: string;
  orderCount: number;
  /** jumlah dokumen per status, semua waktu (buat lihat yang masih pending) */
  byStatus: Record<string, number>;
}

export interface DashboardSummary {
  month: string;
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
