import { Prisma } from '../generated/prisma/client.js';
import {
  InvoiceType,
  JournalSourceType,
  PaymentMethod,
  StockMovementType,
  StockReferenceType,
} from '../generated/prisma/enums.js';
import { toBase, wibDate } from '../currencies/index.js';
import { ACC } from './chart-of-accounts.js';

/**
 * Posting rules: fungsi MURNI "dokumen → draft jurnal" (tanpa DB), jadi aturan
 * akuntansinya bisa dites satu per satu. Service yang mengambil data & menyimpan.
 * Semua nominal dalam IDR (base currency), pakai Decimal (mirip BigDecimal di Java).
 *
 * Mirip Strategy di Java: satu fungsi per jenis dokumen, dipilih oleh service.
 */
type Money = Prisma.Decimal | string | number;
const D = (v: Money) => new Prisma.Decimal(v);
const ZERO = D(0);

export interface DraftLine {
  accountCode: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  description?: string;
}

export interface JournalDraft {
  /** Tanggal kalender WIB (Date 00:00 UTC), seragam untuk semua sumber. */
  date: Date;
  description: string;
  sourceType: JournalSourceType;
  sourceId: string;
  sourceNumber?: string;
  sourceKey: string;
  lines: DraftLine[];
}

export const sourceKey = {
  invoice: (id: string) => `INVOICE:${id}`,
  payment: (id: string) => `PAYMENT:${id}`,
  stock: (id: string) => `STOCK:${id}`,
  reversal: (key: string) => `${key}:REV`,
};

const dr = (accountCode: string, amount: Money, description?: string): DraftLine => ({
  accountCode,
  debit: D(amount),
  credit: ZERO,
  description,
});
const cr = (accountCode: string, amount: Money, description?: string): DraftLine => ({
  accountCode,
  debit: ZERO,
  credit: D(amount),
  description,
});

/** Selisih ke satu akun: positif → debit, negatif → kredit, nol → tidak ada baris. */
function variance(accountCode: string, amount: Prisma.Decimal, description: string): DraftLine[] {
  if (amount.isZero()) return [];
  return amount.gt(0) ? [dr(accountCode, amount, description)] : [cr(accountCode, amount.abs(), description)];
}

/** Buang baris bernilai 0 (mis. produk dengan costPrice 0). */
function compact(lines: DraftLine[]) {
  return lines.filter((l) => !l.debit.isZero() || !l.credit.isZero());
}

// ---------- Invoice ----------

export interface InvoiceSource {
  id: string;
  number: string;
  type: InvoiceType;
  issueDate: Date;
  totalAmountBase: Money;
  partnerName?: string | null;
}

/**
 * - Invoice penjualan (AR): Dr Piutang / Cr Penjualan.
 * - Tagihan supplier (AP): Dr Hutang Belum Ditagih / Cr Hutang Usaha.
 *   (Persediaan sudah didebit saat barang diterima, lihat `stockMovementJournal`.)
 */
export function invoiceJournal(inv: InvoiceSource): JournalDraft | null {
  const amount = D(inv.totalAmountBase);
  if (amount.lte(0)) return null;
  const partner = inv.partnerName ? ` - ${inv.partnerName}` : '';
  const isSales = inv.type === InvoiceType.SALES;
  return {
    date: wibDate(inv.issueDate),
    description: `${isSales ? 'Invoice penjualan' : 'Tagihan supplier'} ${inv.number}${partner}`,
    sourceType: isSales ? JournalSourceType.SALES_INVOICE : JournalSourceType.PURCHASE_BILL,
    sourceId: inv.id,
    sourceNumber: inv.number,
    sourceKey: sourceKey.invoice(inv.id),
    lines: isSales
      ? [dr(ACC.RECEIVABLE, amount), cr(ACC.SALES, amount)]
      : [dr(ACC.GRNI, amount), cr(ACC.PAYABLE, amount)],
  };
}

// ---------- Payment ----------

export interface PaymentSource {
  id: string;
  amount: Money;
  amountBase: Money;
  paidAt: Date;
  method: PaymentMethod;
  reference?: string | null;
  invoice: { number: string; type: InvoiceType; exchangeRate: Money };
}

export const cashAccountFor = (method: PaymentMethod) =>
  method === PaymentMethod.CASH ? ACC.CASH : ACC.BANK;

/**
 * Pelunasan piutang/hutang. Piutang/hutang dinolkan dengan NILAI BUKU (amount x kurs invoice),
 * kas dicatat dengan nilai nyata (amountBase = amount x kurs bayar). Selisihnya laba/rugi kurs.
 *
 * AR: Dr Kas/Bank (nyata) / Cr Piutang (buku) / selisih → 7100
 * AP: Dr Hutang (buku) / Cr Kas/Bank (nyata) / selisih → 7100
 */
export function paymentJournal(p: PaymentSource): JournalDraft | null {
  const cash = D(p.amountBase);
  const book = toBase(p.amount, p.invoice.exchangeRate);
  if (cash.lte(0) && book.lte(0)) return null;
  const cashAcc = cashAccountFor(p.method);
  const isSales = p.invoice.type === InvoiceType.SALES;
  const ref = p.reference ? ` (${p.reference})` : '';

  const lines = isSales
    ? [
        dr(cashAcc, cash),
        cr(ACC.RECEIVABLE, book),
        // kas lebih besar dari piutang → untung kurs (kredit) → variance negatif
        ...variance(ACC.FX_GAIN_LOSS, book.sub(cash), 'Selisih kurs'),
      ]
    : [
        dr(ACC.PAYABLE, book),
        cr(cashAcc, cash),
        // bayar lebih besar dari hutang → rugi kurs (debit)
        ...variance(ACC.FX_GAIN_LOSS, cash.sub(book), 'Selisih kurs'),
      ];

  return {
    date: wibDate(p.paidAt),
    description: `${isSales ? 'Penerimaan' : 'Pembayaran'} ${p.invoice.number}${ref}`,
    sourceType: JournalSourceType.PAYMENT,
    sourceId: p.id,
    sourceNumber: p.invoice.number,
    sourceKey: sourceKey.payment(p.id),
    lines: compact(lines),
  };
}

// ---------- Stock movement ----------

export interface StockMovementSource {
  id: string;
  type: StockMovementType;
  /** positif = masuk, negatif = keluar */
  quantity: number;
  referenceType: StockReferenceType;
  referenceId?: string | null;
  createdAt: Date;
  note?: string | null;
  product: { sku: string; name: string; costPrice: Money };
  /** Nomor dokumen referensi (PO/SO), kalau ada */
  referenceNumber?: string | null;
  /** Khusus PO receive: harga beli per unit dalam IDR (unitPrice x kurs PO) */
  purchaseUnitPriceBase?: Money | null;
}

/** Movement mana yang punya efek akuntansi. Transfer antar gudang dll. tidak (persediaan satu akun). */
export function isPostableMovement(m: Pick<StockMovementSource, 'type' | 'referenceType'>) {
  return (
    m.type === StockMovementType.ADJUSTMENT ||
    m.referenceType === StockReferenceType.PURCHASE_ORDER ||
    m.referenceType === StockReferenceType.SALES_ORDER
  );
}

/**
 * Persediaan dinilai harga standar = `product.costPrice` x qty.
 * - PO receive: Dr Persediaan (standar) / Cr Hutang Belum Ditagih (harga PO x kurs) / selisih → 5300
 * - SO ship:    Dr HPP / Cr Persediaan (standar)
 * - Adjustment: (+) Dr Persediaan / Cr Selisih Persediaan, (-) kebalikannya
 * Return null kalau tidak ada efek (movement tak relevan atau nilainya 0).
 */
export function stockMovementJournal(m: StockMovementSource): JournalDraft | null {
  if (!isPostableMovement(m) || m.quantity === 0) return null;
  const qty = Math.abs(m.quantity);
  const std = toBase(qty, m.product.costPrice);
  const label = `${m.product.sku} ${m.product.name} x${qty}`;
  const ref = m.referenceNumber ? ` ${m.referenceNumber}` : '';
  let description: string;
  let lines: DraftLine[];

  if (m.type === StockMovementType.ADJUSTMENT) {
    description = `Penyesuaian stok ${label}${m.note ? ` - ${m.note}` : ''}`;
    lines =
      m.quantity > 0
        ? [dr(ACC.INVENTORY, std), cr(ACC.INVENTORY_ADJUSTMENT, std)]
        : [dr(ACC.INVENTORY_ADJUSTMENT, std), cr(ACC.INVENTORY, std)];
  } else if (m.referenceType === StockReferenceType.PURCHASE_ORDER) {
    const actual = toBase(qty, m.purchaseUnitPriceBase ?? m.product.costPrice);
    description = `Penerimaan barang${ref} ${label}`;
    lines = [
      dr(ACC.INVENTORY, std),
      cr(ACC.GRNI, actual),
      ...variance(ACC.PURCHASE_PRICE_VARIANCE, actual.sub(std), 'Selisih harga beli vs standar'),
    ];
  } else {
    description = `HPP pengiriman${ref} ${label}`;
    lines =
      m.quantity < 0
        ? [dr(ACC.COGS, std), cr(ACC.INVENTORY, std)]
        : [dr(ACC.INVENTORY, std), cr(ACC.COGS, std)]; // retur (belum ada, jaga-jaga)
  }

  lines = compact(lines);
  if (lines.length === 0) return null;
  return {
    date: wibDate(m.createdAt),
    description,
    sourceType: JournalSourceType.STOCK_MOVEMENT,
    sourceId: m.id,
    sourceNumber: m.referenceNumber ?? undefined,
    sourceKey: sourceKey.stock(m.id),
    lines,
  };
}

// ---------- Helpers ----------

/**
 * Urutan posting dalam satu hari: barang dulu, lalu invoice, lalu pembayaran,
 * supaya buku besar terbaca logis (piutang muncul sebelum pelunasannya).
 */
const RANK: Record<JournalSourceType, number> = {
  MANUAL: 0,
  STOCK_MOVEMENT: 1,
  PURCHASE_BILL: 2,
  SALES_INVOICE: 2,
  PAYMENT: 3,
};
export function compareDrafts(a: JournalDraft, b: JournalDraft) {
  return a.date.getTime() - b.date.getTime() || RANK[a.sourceType] - RANK[b.sourceType];
}


/** Total debit & kredit. Jurnal valid kalau sama dan > 0. */
export function totals(lines: Pick<DraftLine, 'debit' | 'credit'>[]) {
  return lines.reduce(
    (acc, l) => ({ debit: acc.debit.add(l.debit), credit: acc.credit.add(l.credit) }),
    { debit: ZERO, credit: ZERO },
  );
}

export function isBalanced(lines: Pick<DraftLine, 'debit' | 'credit'>[]) {
  const t = totals(lines);
  return t.debit.eq(t.credit) && t.debit.gt(0);
}

/** Jurnal pembalik: debit ↔ kredit. */
export function reverseLines<T extends Pick<DraftLine, 'debit' | 'credit'>>(lines: T[]): T[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}
