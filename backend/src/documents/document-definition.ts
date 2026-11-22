import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces.js';
import { BASE_CURRENCY } from '../currencies/money.js';
import {
  formatAmount,
  formatDate,
  formatMoney,
  formatQty,
  formatRate,
} from './format.js';
import type {
  CompanyProfile,
  PrintableDocument,
} from './printable-document.js';

/** Font standar PDF (tidak perlu file .ttf). Didaftarkan di `PdfRenderer`. */
export const PDF_FONT = 'Helvetica';

const GRAY = '#666666';
const LINE = '#cccccc';
const HEAD_BG = '#eeeeee';

export interface BuildOptions {
  /** Waktu cetak (dipassing dari luar supaya fungsi tetap murni & bisa dites). */
  printedAt: Date;
}

/**
 * Fungsi murni: data dokumen → document definition pdfmake (JSON layout).
 * Tidak ada I/O di sini, jadi unit test cukup cek struktur objek yang dihasilkan.
 * Di Java mirip builder yang mengisi template JasperReports / iText dari bean.
 */
export function buildDocDefinition(
  doc: PrintableDocument,
  company: CompanyProfile,
  { printedAt }: BuildOptions,
): TDocumentDefinitions {
  const foreign = doc.currencyCode !== BASE_CURRENCY;

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    info: {
      title: `${doc.title} ${doc.number}`,
      author: company.name,
      subject: doc.title,
    },
    defaultStyle: { font: PDF_FONT, fontSize: 9, lineHeight: 1.15 },
    styles: {
      company: { fontSize: 14, bold: true },
      title: { fontSize: 16, bold: true, alignment: 'right' },
      muted: { color: GRAY },
      th: { bold: true, fillColor: HEAD_BG },
      sectionTitle: {
        bold: true,
        fontSize: 9,
        color: GRAY,
        margin: [0, 0, 0, 2],
      },
    },
    watermark: doc.watermark
      ? { text: doc.watermark, color: '#cc0000', opacity: 0.12, bold: true }
      : undefined,
    footer: (currentPage: number, pageCount: number) => ({
      margin: [40, 10, 40, 0],
      columns: [
        {
          text: `Dicetak ${formatDate(printedAt)} · ${doc.number}`,
          style: 'muted',
          fontSize: 7,
        },
        {
          text: `Halaman ${currentPage} dari ${pageCount}`,
          alignment: 'right',
          style: 'muted',
          fontSize: 7,
        },
      ],
    }),
    content: [
      header(doc, company),
      hr(),
      partyAndMeta(doc),
      itemsTable(doc),
      totalsBlock(doc, foreign),
      ...(doc.payment ? [paymentBlock(doc, foreign)] : []),
      ...(doc.notes ? [notesBlock(doc.notes)] : []),
      signatureBlock(doc, company, printedAt),
    ],
  };
}

function header(doc: PrintableDocument, company: CompanyProfile): Content {
  const contact = [company.phone && `Telp. ${company.phone}`, company.email]
    .filter(Boolean)
    .join(' · ');
  return {
    columns: [
      {
        width: '*',
        stack: [
          { text: company.name, style: 'company' },
          { text: company.address, style: 'muted' },
          ...(contact ? [{ text: contact, style: 'muted' }] : []),
          { text: `NPWP: ${company.npwp}`, style: 'muted' },
        ],
      },
      {
        width: 'auto',
        stack: [
          { text: doc.title, style: 'title' },
          { text: doc.number, alignment: 'right', bold: true, fontSize: 11 },
          {
            text: `Status: ${doc.statusLabel}`,
            alignment: 'right',
            style: 'muted',
          },
        ],
      },
    ],
  };
}

function hr(): Content {
  return {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 515,
        y2: 0,
        lineWidth: 1,
        lineColor: LINE,
      },
    ],
    margin: [0, 8, 0, 8],
  };
}

function partyAndMeta(doc: PrintableDocument): Content {
  const p = doc.party;
  const lines = [p.address, p.phone && `Telp. ${p.phone}`, p.email].filter(
    (x): x is string => !!x,
  );
  return {
    columns: [
      {
        width: '*',
        stack: [
          { text: p.heading, style: 'sectionTitle' },
          { text: p.name, bold: true },
          { text: p.code, style: 'muted' },
          ...lines.map((text) => ({ text })),
        ],
      },
      {
        width: 220,
        table: {
          widths: [90, '*'],
          body: doc.meta.map((m) => [
            { text: m.label, style: 'muted' },
            { text: m.value, bold: true },
          ]),
        },
        layout: 'noBorders',
      },
    ],
    margin: [0, 0, 0, 12],
  };
}

/** Header tabel item dipakai juga oleh test, jadi diekspor. */
export const ITEM_HEADERS = [
  'No',
  'Produk',
  'Qty',
  'Satuan',
  'Harga Satuan',
  'Subtotal',
];

function itemsTable(doc: PrintableDocument): Content {
  const code = doc.currencyCode;
  const head: TableCell[] = ITEM_HEADERS.map((text, i) => ({
    text,
    style: 'th',
    alignment: i >= 4 || i === 2 ? 'right' : 'left',
  }));
  const rows: TableCell[][] = doc.items.map((it, i) => [
    { text: String(i + 1) },
    {
      stack: [{ text: it.name }, { text: it.sku, style: 'muted', fontSize: 7 }],
    },
    { text: formatQty(it.quantity), alignment: 'right' },
    { text: it.unit },
    { text: formatAmount(it.unitPrice, code), alignment: 'right' },
    { text: formatAmount(it.subtotal, code), alignment: 'right' },
  ]);
  if (rows.length === 0) {
    rows.push([
      {
        text: 'Tidak ada item',
        colSpan: 6,
        alignment: 'center',
        style: 'muted',
      },
      '',
      '',
      '',
      '',
      '',
    ]);
  }
  return {
    table: {
      headerRows: 1,
      widths: [20, '*', 40, 40, 85, 90],
      body: [head, ...rows],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => LINE,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 0, 0, 8],
  };
}

function totalsBlock(doc: PrintableDocument, foreign: boolean): Content {
  const code = doc.currencyCode;
  const rows: TableCell[][] = [
    [
      { text: 'Subtotal', style: 'muted' },
      { text: formatMoney(doc.subtotal, code), alignment: 'right' },
    ],
    [
      { text: 'PPN', style: 'muted' },
      { text: formatMoney(doc.taxAmount, code), alignment: 'right' },
    ],
    [
      { text: 'Total', bold: true, fontSize: 11 },
      {
        text: formatMoney(doc.total, code),
        bold: true,
        fontSize: 11,
        alignment: 'right',
      },
    ],
  ];
  if (foreign) {
    rows.push(
      [
        { text: 'Kurs', style: 'muted' },
        {
          text: `1 ${code} = ${BASE_CURRENCY} ${formatRate(doc.exchangeRate)}`,
          alignment: 'right',
        },
      ],
      [
        { text: `Setara ${BASE_CURRENCY}`, bold: true },
        {
          text: formatMoney(doc.totalBase, BASE_CURRENCY),
          bold: true,
          alignment: 'right',
        },
      ],
    );
  }
  return {
    columns: [
      {
        width: '*',
        text: foreign
          ? `Mata uang dokumen: ${code}. Nilai ${BASE_CURRENCY} memakai kurs yang tercatat di dokumen.`
          : `Mata uang dokumen: ${code}.`,
        style: 'muted',
        fontSize: 8,
      },
      {
        width: 230,
        table: { widths: ['*', 'auto'], body: rows },
        layout: 'lightHorizontalLines',
      },
    ],
    margin: [0, 0, 0, 12],
  };
}

function paymentBlock(doc: PrintableDocument, foreign: boolean): Content {
  const pay = doc.payment!;
  const code = doc.currencyCode;
  const summary: TableCell[][] = [
    [
      { text: 'Status pembayaran', style: 'muted' },
      {
        text: pay.statusLabel + (pay.isOverdue ? ' (lewat jatuh tempo)' : ''),
        bold: true,
      },
    ],
    [
      { text: 'Sudah dibayar', style: 'muted' },
      { text: formatMoney(pay.paidAmount, code) },
    ],
    [
      { text: 'Sisa tagihan', style: 'muted' },
      { text: formatMoney(pay.outstandingAmount, code), bold: true },
    ],
  ];
  if (foreign) {
    summary.push([
      { text: `Sisa (${BASE_CURRENCY})`, style: 'muted' },
      { text: formatMoney(pay.outstandingAmountBase, BASE_CURRENCY) },
    ]);
  }
  const history: Content = pay.payments.length
    ? {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', 'auto'],
          body: [
            ['Tanggal', 'Metode', 'Referensi', 'Jumlah'].map(
              (text, i): TableCell => ({
                text,
                style: 'th',
                alignment: i === 3 ? 'right' : 'left',
              }),
            ),
            ...pay.payments.map((p): TableCell[] => [
              formatDate(p.paidAt),
              p.method,
              p.reference ?? '-',
              { text: formatAmount(p.amount, code), alignment: 'right' },
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
        fontSize: 8,
      }
    : { text: 'Belum ada pembayaran.', style: 'muted', fontSize: 8 };

  return {
    stack: [
      { text: 'Pembayaran', style: 'sectionTitle' },
      {
        columns: [
          {
            width: 250,
            table: { widths: [80, '*'], body: summary },
            layout: 'noBorders',
          },
          { width: '*', stack: [history] },
        ],
        columnGap: 15,
      },
    ],
    margin: [0, 0, 0, 12],
  };
}

function notesBlock(notes: string): Content {
  return {
    stack: [{ text: 'Catatan', style: 'sectionTitle' }, { text: notes }],
    margin: [0, 0, 0, 12],
  };
}

function signatureBlock(
  doc: PrintableDocument,
  company: CompanyProfile,
  printedAt: Date,
): Content {
  return {
    unbreakable: true,
    stack: [
      {
        text: `${company.city}, ${formatDate(printedAt)}`,
        alignment: 'right',
        margin: [0, 8, 0, 8],
      },
      {
        columns: doc.signatures.map((s) => ({
          width: '*',
          alignment: 'center',
          stack: [
            { text: s.label },
            { text: ' ', margin: [0, 0, 0, 45] },
            {
              text: s.name
                ? `( ${s.name} )`
                : '(                              )',
            },
          ],
        })),
      },
    ],
  };
}
