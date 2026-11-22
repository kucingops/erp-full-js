import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import {
  PurchaseReportExportDto,
  PurchaseReportQueryDto,
  SalesReportExportDto,
  SalesReportQueryDto,
  StockMovementExportDto,
  StockMovementReportQueryDto,
  StockValuationExportDto,
  StockValuationQueryDto,
  type ExportFormat,
} from './dto/report.dto.js';
import { EXPORTERS } from './export/report-exporter.js';
import {
  orderReportTable,
  stockMovementTable,
  stockValuationTable,
  type ReportTable,
} from './export/report-table.js';
import { ReportsService } from './reports.service.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Laporan read-only. Tiap laporan punya 2 endpoint: JSON (untuk tabel di FE)
 * dan `/export?format=csv|xlsx` (file). Filter keduanya sama persis.
 *
 * Role mengikuti pemilik data (lihat docs/reports.md):
 * - penjualan: SALES, pembelian: PURCHASING (angka uang per customer/supplier)
 * - stok: WAREHOUSE, SALES, PURCHASING (sama dengan baca inventory)
 * ADMIN selalu lolos lewat RolesGuard.
 */
@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @Roles(Role.SALES)
  sales(@Query() q: SalesReportQueryDto) {
    return this.reports.sales(q);
  }

  @Get('sales/export')
  @Roles(Role.SALES)
  @ApiProduces('text/csv', XLSX)
  async exportSales(@Query() q: SalesReportExportDto) {
    return toFile(orderReportTable('sales', await this.reports.sales(q)), q.format);
  }

  @Get('purchases')
  @Roles(Role.PURCHASING)
  purchases(@Query() q: PurchaseReportQueryDto) {
    return this.reports.purchases(q);
  }

  @Get('purchases/export')
  @Roles(Role.PURCHASING)
  @ApiProduces('text/csv', XLSX)
  async exportPurchases(@Query() q: PurchaseReportExportDto) {
    return toFile(orderReportTable('purchases', await this.reports.purchases(q)), q.format);
  }

  @Get('stock-valuation')
  @Roles(Role.WAREHOUSE, Role.SALES, Role.PURCHASING)
  stockValuation(@Query() q: StockValuationQueryDto) {
    return this.reports.stockValuation(q);
  }

  @Get('stock-valuation/export')
  @Roles(Role.WAREHOUSE, Role.SALES, Role.PURCHASING)
  @ApiProduces('text/csv', XLSX)
  async exportStockValuation(@Query() q: StockValuationExportDto) {
    return toFile(stockValuationTable(await this.reports.stockValuation(q)), q.format);
  }

  @Get('stock-movements')
  @Roles(Role.WAREHOUSE, Role.SALES, Role.PURCHASING)
  stockMovements(@Query() q: StockMovementReportQueryDto) {
    return this.reports.stockMovements(q);
  }

  @Get('stock-movements/export')
  @Roles(Role.WAREHOUSE, Role.SALES, Role.PURCHASING)
  @ApiProduces('text/csv', XLSX)
  async exportStockMovements(@Query() q: StockMovementExportDto) {
    return toFile(stockMovementTable(await this.reports.stockMovements(q)), q.format);
  }
}

/** Render tabel lewat exporter yang dipilih, kirim sebagai attachment. */
async function toFile(table: ReportTable, format: ExportFormat): Promise<StreamableFile> {
  const exporter = EXPORTERS[format];
  const buffer = await exporter.render(table);
  return new StreamableFile(buffer, {
    type: exporter.contentType,
    disposition: `attachment; filename="${table.filename}.${exporter.extension}"`,
    length: buffer.length,
  });
}
