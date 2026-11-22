import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { CURRENCY_CODE } from '../../currencies/index.js';
import {
  PurchaseOrderStatus,
  SalesOrderStatus,
} from '../../generated/prisma/enums.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Rentang tanggal kalender WIB, inklusif. Default: awal bulan ini s/d hari ini. */
export class PeriodQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01', description: 'Tanggal awal (WIB), inklusif' })
  @IsOptional()
  @Matches(DATE, { message: 'from harus format YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Tanggal akhir (WIB), inklusif' })
  @IsOptional()
  @Matches(DATE, { message: 'to harus format YYYY-MM-DD' })
  to?: string;
}

export const ORDER_GROUPS = ['day', 'month', 'partner', 'product'] as const;
export type OrderGroupBy = (typeof ORDER_GROUPS)[number];

class OrderReportBaseDto extends PeriodQueryDto {
  @ApiPropertyOptional({
    enum: ORDER_GROUPS,
    default: 'month',
    description: 'partner = customer (penjualan) / supplier (pembelian)',
  })
  @IsOptional()
  @IsIn(ORDER_GROUPS)
  groupBy: OrderGroupBy = 'month';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'Hanya dokumen bermata uang ini. Total tetap IDR, plus kolom totalDoc (mata uang dokumen).',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @Matches(CURRENCY_CODE, { message: 'currencyCode harus 3 huruf (ISO 4217)' })
  currencyCode?: string;
}

export class SalesReportQueryDto extends OrderReportBaseDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    enum: SalesOrderStatus,
    description: 'Default: CONFIRMED + SHIPPED (dokumen yang sudah jalan)',
  })
  @IsOptional()
  @IsIn(Object.values(SalesOrderStatus))
  status?: SalesOrderStatus;
}

export class PurchaseReportQueryDto extends OrderReportBaseDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({
    enum: PurchaseOrderStatus,
    description: 'Default: APPROVED + RECEIVED (dokumen yang sudah jalan)',
  })
  @IsOptional()
  @IsIn(Object.values(PurchaseOrderStatus))
  status?: PurchaseOrderStatus;
}

class StockFilterDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Cari SKU / nama produk' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class StockValuationQueryDto extends StockFilterDto {}

export class StockMovementReportQueryDto extends IntersectionType(PeriodQueryDto, StockFilterDto) {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;
}

export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export class ExportFormatDto {
  @ApiProperty({ enum: EXPORT_FORMATS, default: 'xlsx' })
  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format: ExportFormat = 'xlsx';
}

export class SalesReportExportDto extends IntersectionType(SalesReportQueryDto, ExportFormatDto) {}
export class PurchaseReportExportDto extends IntersectionType(PurchaseReportQueryDto, ExportFormatDto) {}
export class StockValuationExportDto extends IntersectionType(StockValuationQueryDto, ExportFormatDto) {}
export class StockMovementExportDto extends IntersectionType(
  StockMovementReportQueryDto,
  ExportFormatDto,
) {}

// ===== Bentuk response (uang = string, sama dengan endpoint lain) =====

export interface OrderReportRow {
  /** tanggal/bulan untuk grup periode, id untuk partner/produk */
  key: string;
  label: string;
  /** kode customer/supplier atau SKU produk */
  code: string | null;
  orderCount: number;
  quantity: number;
  /** Total dalam IDR (base currency), dari total_amount_base dokumen */
  total: string;
  /** Total dalam mata uang dokumen. Hanya bermakna kalau `docCurrency` tidak null. */
  totalDoc: string;
}

export interface OrderReportTotals {
  orderCount: number;
  quantity: number;
  total: string;
  totalDoc: string;
}

/** Rincian per mata uang dokumen dalam periode/filter yang sama. */
export interface OrderReportCurrencyRow {
  currencyCode: string;
  orderCount: number;
  /** dalam mata uang dokumen */
  total: string;
  /** dalam IDR */
  totalBase: string;
}

export interface OrderReport {
  from: string;
  to: string;
  groupBy: OrderGroupBy;
  statuses: string[];
  /** Selalu IDR: kolom `total` dijumlah dalam mata uang ini */
  baseCurrency: string;
  /**
   * Mata uang dokumen kalau semua dokumen di laporan satu mata uang (atau difilter
   * `currencyCode`), jadi `totalDoc` bisa ditampilkan. null kalau campur.
   */
  docCurrency: string | null;
  rows: OrderReportRow[];
  totals: OrderReportTotals;
  currencies: OrderReportCurrencyRow[];
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
  totals: Omit<StockMovementRow, 'productId' | 'sku' | 'name' | 'unit'>;
}
