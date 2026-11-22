import type { Content } from 'pdfmake/interfaces.js';
import { companyFromEnv, DEFAULT_COMPANY } from './company-profile.js';
import { buildDocDefinition, ITEM_HEADERS } from './document-definition.js';
import { formatAmount, formatDate, formatMoney, formatRate } from './format.js';
import type { PrintableDocument } from './printable-document.js';

/** Kumpulkan semua teks di layout (rekursif), supaya assertion tidak terikat struktur detail. */
function texts(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === 'object')
    return Object.values(node).flatMap(texts);
  return [];
}

const base: PrintableDocument = {
  kind: 'PURCHASE_ORDER',
  title: 'PURCHASE ORDER',
  number: 'PO-20261122-0001',
  statusLabel: 'Disetujui',
  meta: [{ label: 'Tanggal PO', value: '22 November 2026' }],
  party: {
    heading: 'Kepada (supplier)',
    code: 'SUP-1',
    name: 'CV Sumber',
    address: 'Bandung',
  },
  items: [
    {
      sku: 'P-1',
      name: 'Kertas A4',
      unit: 'rim',
      quantity: 1200,
      unitPrice: '45000',
      subtotal: '54000000',
    },
  ],
  currencyCode: 'IDR',
  exchangeRate: '1',
  subtotal: '54000000',
  taxAmount: '0',
  total: '54000000',
  totalBase: '54000000',
  notes: 'Kirim sebelum tanggal 30',
  signatures: [{ label: 'Dibuat oleh', name: 'Budi' }, { label: 'Supplier' }],
};

const printedAt = new Date('2026-11-22T03:00:00Z');
const build = (over: Partial<PrintableDocument> = {}) =>
  buildDocDefinition({ ...base, ...over }, DEFAULT_COMPANY, { printedAt });

describe('format (id-ID)', () => {
  it('angka pakai titik ribuan & koma desimal, digit ikut mata uang', () => {
    expect(formatAmount('1234567.5', 'USD')).toBe('1.234.567,50');
    expect(formatAmount('100', 'JPY')).toBe('100');
    expect(formatMoney('12.5', 'USD')).toBe('USD 12,50');
    expect(formatRate('15850.500000')).toBe('15.850,5');
  });

  it('tanggal dalam WIB: 22 Nov 18:30 UTC = 23 Nov WIB', () => {
    expect(formatDate(new Date('2026-11-22T18:30:00Z'))).toBe(
      '23 November 2026',
    );
    expect(formatDate(null)).toBe('-');
  });
});

describe('companyFromEnv', () => {
  it('pakai env kalau ada, default kalau kosong', () => {
    const c = companyFromEnv({
      COMPANY_NAME: 'PT Maju',
      COMPANY_NPWP: '  ',
      COMPANY_PHONE: '021',
    });
    expect(c.name).toBe('PT Maju');
    expect(c.npwp).toBe(DEFAULT_COMPANY.npwp);
    expect(c.phone).toBe('021');
    expect(c.email).toBeUndefined();
  });
});

describe('buildDocDefinition', () => {
  it('berisi kop perusahaan, judul, nomor, partner, dan tanda tangan', () => {
    const all = texts(build().content);
    expect(all).toEqual(
      expect.arrayContaining([
        DEFAULT_COMPANY.name,
        `NPWP: ${DEFAULT_COMPANY.npwp}`,
        'PURCHASE ORDER',
        'PO-20261122-0001',
        'CV Sumber',
        'Kirim sebelum tanggal 30',
        '( Budi )',
        'Jakarta, 22 November 2026',
      ]),
    );
  });

  it('tabel item: header + baris dengan format id-ID', () => {
    const def = build();
    const table = (def.content as Content[]).find(
      (c) =>
        typeof c === 'object' &&
        'table' in c &&
        (c.table.body[0] as unknown[]).length === 6,
    ) as { table: { body: unknown[][]; headerRows: number } };
    expect(table.table.headerRows).toBe(1);
    expect(texts(table.table.body[0])).toEqual(
      expect.arrayContaining(ITEM_HEADERS),
    );
    expect(texts(table.table.body[1])).toEqual(
      expect.arrayContaining([
        '1',
        'Kertas A4',
        'P-1',
        '1.200',
        'rim',
        '45.000',
        '54.000.000',
      ]),
    );
  });

  it('IDR: tanpa baris kurs / setara IDR', () => {
    const all = texts(build().content);
    expect(all).toContain('IDR 54.000.000');
    expect(all.some((t) => t.startsWith('Setara'))).toBe(false);
    expect(all.some((t) => t.startsWith('1 IDR ='))).toBe(false);
  });

  it('mata uang asing: tampil kurs dan total setara IDR', () => {
    const all = texts(
      build({
        currencyCode: 'USD',
        exchangeRate: '16250.5',
        total: '100',
        subtotal: '100',
        totalBase: '1625050',
      }).content,
    );
    expect(all).toEqual(
      expect.arrayContaining([
        'USD 100,00',
        '1 USD = IDR 16.250,5',
        'Setara IDR',
        'IDR 1.625.050',
      ]),
    );
  });

  it('invoice: blok pembayaran (status, dibayar, sisa, histori)', () => {
    const all = texts(
      build({
        payment: {
          statusLabel: 'Dibayar sebagian',
          isOverdue: true,
          paidAmount: '1000',
          outstandingAmount: '53999000',
          outstandingAmountBase: '53999000',
          payments: [
            {
              paidAt: new Date('2026-11-23T00:00:00Z'),
              method: 'Transfer',
              reference: 'TRX-9',
              amount: '1000',
            },
          ],
        },
      }).content,
    );
    expect(all).toEqual(
      expect.arrayContaining([
        'Pembayaran',
        'Dibayar sebagian (lewat jatuh tempo)',
        'IDR 1.000',
        'IDR 53.999.000',
        'TRX-9',
        '23 November 2026',
      ]),
    );
  });

  it('tanpa payment/notes: blok tidak muncul; item kosong tetap ada baris placeholder', () => {
    const all = texts(build({ notes: null, items: [] }).content);
    expect(all).not.toContain('Pembayaran');
    expect(all).not.toContain('Catatan');
    expect(all).toContain('Tidak ada item');
  });

  it('watermark hanya kalau diisi; metadata & footer', () => {
    expect(build().watermark).toBeUndefined();
    expect(build({ watermark: 'DRAFT' }).watermark).toMatchObject({
      text: 'DRAFT',
    });
    const def = build();
    expect(def.info?.title).toBe('PURCHASE ORDER PO-20261122-0001');
    const footer = (def.footer as (p: number, c: number) => unknown)(1, 2);
    expect(texts(footer)).toContain('Halaman 1 dari 2');
  });
});
