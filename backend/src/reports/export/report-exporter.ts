import ExcelJS from 'exceljs';
import type { ExportFormat } from '../dto/report.dto.js';
import type { Cell, ReportColumn, ReportTable } from './report-table.js';

/**
 * Strategy pattern untuk format export. Di Java ini biasanya
 * `interface ReportExporter { byte[] render(ReportTable t); }` + beberapa `@Component`
 * lalu dipilih lewat Map<String, ReportExporter>. Di sini sama: interface + class + map.
 */
export interface ReportExporter {
  readonly contentType: string;
  readonly extension: string;
  render(table: ReportTable): Promise<Buffer>;
}

/**
 * CSV untuk diolah ulang (import ke tool lain). Uang ditulis angka polos "1500000.00"
 * (tanpa "Rp" / titik ribuan) supaya tetap bisa dihitung.
 */
export class CsvExporter implements ReportExporter {
  readonly contentType = 'text/csv; charset=utf-8';
  readonly extension = 'csv';

  render(table: ReportTable): Promise<Buffer> {
    const line = (cells: Cell[], cols: ReportColumn[]) =>
      cells.map((c, i) => csvCell(c, cols[i]?.kind ?? 'text')).join(',');
    const keys = table.columns.map((c) => c.key);
    const textCols = table.columns.map(() => ({ kind: 'text' }) as ReportColumn);

    const lines = [
      line(
        table.columns.map((c) => c.header),
        textCols,
      ),
      ...table.rows.map((r) => line(keys.map((k) => r[k] ?? null), table.columns)),
      ...(table.totals ? [line(keys.map((k) => table.totals![k] ?? null), table.columns)] : []),
    ];
    // BOM supaya Excel membuka UTF-8 dengan benar (nama produk ber-aksen dsb).
    return Promise.resolve(Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8'));
  }
}

/**
 * Escape sel CSV (RFC 4180) + cegah CSV/formula injection:
 * teks yang diawali = + - @ bisa dieksekusi Excel sebagai formula, jadi diberi prefix `'`.
 * Kolom angka tidak diprefix (angka negatif valid).
 */
export function csvCell(value: Cell, kind: ReportColumn['kind']): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (kind === 'text' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel dengan judul, header tebal, format ribuan, dan baris total. */
export class XlsxExporter implements ReportExporter {
  readonly contentType =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  readonly extension = 'xlsx';

  async render(table: ReportTable): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Mini ERP';
    const ws = wb.addWorksheet(table.title.slice(0, 31)); // batas nama sheet Excel

    ws.addRow([table.title]).font = { bold: true, size: 14 };
    ws.addRow([table.subtitle]).font = { italic: true, color: { argb: 'FF666666' } };
    ws.addRow([]);

    const header = ws.addRow(table.columns.map((c) => c.header));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
      cell.border = { bottom: { style: 'thin' } };
    });

    for (const r of table.rows) ws.addRow(table.columns.map((c) => xlsxValue(r[c.key], c)));
    if (table.totals) {
      const t = ws.addRow(table.columns.map((c) => xlsxValue(table.totals![c.key], c)));
      t.font = { bold: true };
      t.eachCell((cell) => (cell.border = { top: { style: 'thin' } }));
    }

    table.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.kind === 'money') col.numFmt = '#,##0.00';
      if (c.kind === 'int') col.numFmt = '#,##0';
      col.width = c.kind === 'text' ? 28 : 18;
    });
    // Freeze header tabel (baris 4) supaya tetap terlihat saat scroll.
    ws.views = [{ state: 'frozen', ySplit: 4 }];

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}

/** Uang dikirim DB sebagai string -> jadi angka supaya bisa dijumlah di Excel. */
function xlsxValue(value: Cell | undefined, col: ReportColumn): Cell {
  if (value === null || value === undefined) return null;
  return col.kind === 'text' ? value : Number(value);
}

export const EXPORTERS: Record<ExportFormat, ReportExporter> = {
  csv: new CsvExporter(),
  xlsx: new XlsxExporter(),
};
