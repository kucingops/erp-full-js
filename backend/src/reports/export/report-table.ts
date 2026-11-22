import type {
  OrderReport,
  StockMovementReport,
  StockValuationReport,
} from '../dto/report.dto.js';

/**
 * Bentuk tabel netral (tidak tahu CSV/Excel). Laporan apa pun diubah ke sini dulu,
 * lalu exporter tinggal merender. Jadi tambah format baru (PDF?) tidak menyentuh laporan,
 * dan tambah laporan baru tidak menyentuh exporter (Open/Closed principle).
 */
export type CellKind = 'text' | 'int' | 'money';
export type Cell = string | number | null;

export interface ReportColumn {
  key: string;
  header: string;
  kind: CellKind;
}

export interface ReportTable {
  /** Judul sheet / baris pertama */
  title: string;
  /** Keterangan filter, misal "Periode 2026-11-01 s/d 2026-11-30" */
  subtitle: string;
  /** Nama file tanpa ekstensi */
  filename: string;
  columns: ReportColumn[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
}

const PARTNER_LABEL = { sales: 'Customer', purchases: 'Supplier' } as const;
const GROUP_HEADER = { day: 'Tanggal', month: 'Bulan', product: 'Produk' } as const;

export function orderReportTable(kind: 'sales' | 'purchases', r: OrderReport): ReportTable {
  const title = kind === 'sales' ? 'Laporan Penjualan' : 'Laporan Pembelian';
  const partner = PARTNER_LABEL[kind];
  const isPeriod = r.groupBy === 'day' || r.groupBy === 'month';
  const groupHeader = r.groupBy === 'partner' ? partner : GROUP_HEADER[r.groupBy];
  const codeHeader = r.groupBy === 'product' ? 'SKU' : 'Kode';
  const showDoc = !!r.docCurrency && r.docCurrency !== r.baseCurrency;

  const columns: ReportColumn[] = [
    ...(isPeriod ? [] : [{ key: 'code', header: codeHeader, kind: 'text' as const }]),
    { key: 'label', header: groupHeader, kind: 'text' },
    { key: 'orderCount', header: 'Jumlah Dokumen', kind: 'int' },
    { key: 'quantity', header: 'Qty', kind: 'int' },
    // Kolom mata uang dokumen hanya kalau semua dokumen satu mata uang asing.
    ...(showDoc
      ? [{ key: 'totalDoc', header: `Total (${r.docCurrency})`, kind: 'money' as const }]
      : []),
    { key: 'total', header: `Total (${r.baseCurrency})`, kind: 'money' },
  ];
  // Rincian per mata uang ditulis di subtitle supaya file tetap satu tabel rata.
  const perCurrency =
    r.currencies.length > 1 || showDoc
      ? ` | per mata uang: ${r.currencies
          .map((c) => `${c.currencyCode} ${c.total} = ${r.baseCurrency} ${c.totalBase}`)
          .join('; ')}`
      : '';
  return {
    title,
    subtitle: `Periode ${r.from} s/d ${r.to} | per ${groupHeader.toLowerCase()} | status ${r.statuses.join(', ')}${perCurrency}`,
    filename: `${kind === 'sales' ? 'laporan-penjualan' : 'laporan-pembelian'}_${r.groupBy}_${r.from}_${r.to}${r.docCurrency && showDoc ? `_${r.docCurrency}` : ''}`,
    columns,
    rows: r.rows.map((row) => ({ ...row })),
    totals: { [isPeriod ? 'label' : 'code']: 'TOTAL', ...r.totals },
  };
}

export function stockValuationTable(r: StockValuationReport): ReportTable {
  const asOf = r.asOf.slice(0, 10);
  return {
    title: 'Laporan Nilai Persediaan',
    subtitle: `Per ${r.asOf} (nilai = qty x harga pokok)`,
    filename: `laporan-nilai-stok_${asOf}`,
    columns: [
      { key: 'sku', header: 'SKU', kind: 'text' },
      { key: 'name', header: 'Produk', kind: 'text' },
      { key: 'category', header: 'Kategori', kind: 'text' },
      { key: 'unit', header: 'Satuan', kind: 'text' },
      { key: 'quantity', header: 'Qty', kind: 'int' },
      { key: 'costPrice', header: 'Harga Pokok (IDR)', kind: 'money' },
      { key: 'value', header: 'Nilai (IDR)', kind: 'money' },
    ],
    rows: r.rows.map((row) => ({ ...row })),
    totals: { sku: 'TOTAL', ...r.totals },
  };
}

export function stockMovementTable(r: StockMovementReport): ReportTable {
  return {
    title: 'Laporan Mutasi Stok',
    subtitle: `Periode ${r.from} s/d ${r.to}`,
    filename: `laporan-mutasi-stok_${r.from}_${r.to}`,
    columns: [
      { key: 'sku', header: 'SKU', kind: 'text' },
      { key: 'name', header: 'Produk', kind: 'text' },
      { key: 'unit', header: 'Satuan', kind: 'text' },
      { key: 'opening', header: 'Saldo Awal', kind: 'int' },
      { key: 'inQty', header: 'Masuk', kind: 'int' },
      { key: 'outQty', header: 'Keluar', kind: 'int' },
      { key: 'adjustment', header: 'Penyesuaian', kind: 'int' },
      { key: 'closing', header: 'Saldo Akhir', kind: 'int' },
    ],
    rows: r.rows.map((row) => ({ ...row })),
    totals: { sku: 'TOTAL', ...r.totals },
  };
}
