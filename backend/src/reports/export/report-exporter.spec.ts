import ExcelJS from 'exceljs';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../generated/prisma/enums.js';
import type { OrderReport } from '../dto/report.dto.js';
import { ReportsController } from '../reports.controller.js';
import { CsvExporter, csvCell, XlsxExporter } from './report-exporter.js';
import { orderReportTable } from './report-table.js';

const report: OrderReport = {
  from: '2026-11-01',
  to: '2026-11-30',
  groupBy: 'partner',
  statuses: ['CONFIRMED', 'SHIPPED'],
  baseCurrency: 'IDR',
  docCurrency: 'IDR',
  rows: [
    { key: 'c1', label: 'PT "Maju", Jaya', code: 'C001', orderCount: 2, quantity: 10, total: '1500000.00', totalDoc: '1500000.00' },
    { key: 'c2', label: '=HYPERLINK("x")', code: 'C002', orderCount: 1, quantity: 1, total: '-5.50', totalDoc: '-5.50' },
  ],
  totals: { orderCount: 3, quantity: 11, total: '1499994.50', totalDoc: '1499994.50' },
  currencies: [{ currencyCode: 'IDR', orderCount: 3, total: '1499994.50', totalBase: '1499994.50' }],
};

describe('orderReportTable', () => {
  it('grup partner penjualan: kolom Kode + Customer, nama file berisi periode', () => {
    const t = orderReportTable('sales', report);
    expect(t.columns.map((c) => c.header)).toEqual([
      'Kode',
      'Customer',
      'Jumlah Dokumen',
      'Qty',
      'Total (IDR)',
    ]);
    expect(t.filename).toBe('laporan-penjualan_partner_2026-11-01_2026-11-30');
    expect(t.totals).toMatchObject({ code: 'TOTAL', total: '1499994.50' });
  });

  it('grup periode tidak punya kolom kode', () => {
    const t = orderReportTable('purchases', { ...report, groupBy: 'month' });
    expect(t.columns[0]).toMatchObject({ key: 'label', header: 'Bulan' });
    expect(t.totals).toMatchObject({ label: 'TOTAL' });
  });

  it('semua dokumen satu mata uang asing: tambah kolom Total (USD) + rincian di subtitle', () => {
    const t = orderReportTable('sales', {
      ...report,
      docCurrency: 'USD',
      currencies: [{ currencyCode: 'USD', orderCount: 3, total: '100.00', totalBase: '1499994.50' }],
    });
    expect(t.columns.map((c) => c.header).slice(-2)).toEqual(['Total (USD)', 'Total (IDR)']);
    expect(t.subtitle).toContain('USD 100.00 = IDR 1499994.50');
    expect(t.filename).toMatch(/_USD$/);
  });

  it('mata uang campur: hanya Total (IDR), rincian per mata uang di subtitle', () => {
    const t = orderReportTable('sales', {
      ...report,
      docCurrency: null,
      currencies: [
        { currencyCode: 'IDR', orderCount: 2, total: '500.00', totalBase: '500.00' },
        { currencyCode: 'USD', orderCount: 1, total: '1.00', totalBase: '15000.00' },
      ],
    });
    expect(t.columns.map((c) => c.key)).not.toContain('totalDoc');
    expect(t.subtitle).toContain('IDR 500.00 = IDR 500.00; USD 1.00 = IDR 15000.00');
  });
});

describe('csvCell', () => {
  it('escape koma & kutip (RFC 4180)', () => {
    expect(csvCell('PT "Maju", Jaya', 'text')).toBe('"PT ""Maju"", Jaya"');
  });
  it('cegah formula injection di kolom teks, tapi angka negatif tetap angka', () => {
    expect(csvCell('=1+1', 'text')).toBe("'=1+1");
    expect(csvCell('-5.50', 'money')).toBe('-5.50');
    expect(csvCell(null, 'int')).toBe('');
  });
});

describe('CsvExporter', () => {
  it('BOM + header + baris + total', async () => {
    const buf = await new CsvExporter().render(orderReportTable('sales', report));
    const text = buf.toString('utf8');
    expect(text.startsWith('﻿')).toBe(true);
    const lines = text.slice(1).trimEnd().split('\r\n');
    expect(lines).toEqual([
      'Kode,Customer,Jumlah Dokumen,Qty,Total (IDR)',
      'C001,"PT ""Maju"", Jaya",2,10,1500000.00',
      `C002,"'=HYPERLINK(""x"")",1,1,-5.50`,
      'TOTAL,,3,11,1499994.50',
    ]);
  });
});

describe('XlsxExporter', () => {
  it('menulis workbook yang bisa dibaca ulang, uang sebagai angka', async () => {
    const buf = await new XlsxExporter().render(orderReportTable('sales', report));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];

    expect(ws.name).toBe('Laporan Penjualan');
    expect(ws.getRow(4).values).toEqual([undefined, 'Kode', 'Customer', 'Jumlah Dokumen', 'Qty', 'Total (IDR)']);
    expect(ws.getCell('E5').value).toBe(1500000);
    expect(ws.getColumn(5).numFmt).toBe('#,##0.00');
    expect(ws.getCell('A7').value).toBe('TOTAL');
  });
});

describe('RBAC reports', () => {
  const roles = (method: keyof ReportsController) =>
    Reflect.getMetadata(ROLES_KEY, ReportsController.prototype[method]) as Role[];

  it.each([
    ['sales', [Role.SALES]],
    ['exportSales', [Role.SALES]],
    ['purchases', [Role.PURCHASING]],
    ['exportPurchases', [Role.PURCHASING]],
    ['stockValuation', [Role.WAREHOUSE, Role.SALES, Role.PURCHASING]],
    ['exportStockValuation', [Role.WAREHOUSE, Role.SALES, Role.PURCHASING]],
    ['stockMovements', [Role.WAREHOUSE, Role.SALES, Role.PURCHASING]],
    ['exportStockMovements', [Role.WAREHOUSE, Role.SALES, Role.PURCHASING]],
  ] as const)('%s -> %j', (method, expected) => {
    expect(roles(method)).toEqual(expected);
  });
});
