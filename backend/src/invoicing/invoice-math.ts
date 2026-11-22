import { Prisma } from '../generated/prisma/client.js';
import { InvoiceStatus } from '../generated/prisma/enums.js';
import { toBase } from '../currencies/index.js';

/**
 * Fungsi murni seputar hitungan invoice (tanpa DB) supaya gampang di-unit-test.
 * Semua uang pakai `Prisma.Decimal` (mirip `BigDecimal` di Java), jangan `number`.
 */
type Money = Prisma.Decimal | string | number;
const dec = (v: Money) => new Prisma.Decimal(v);

/** Status dari total & jumlah yang sudah dibayar. */
export function deriveStatus(total: Money, paid: Money): InvoiceStatus {
  const p = dec(paid);
  if (p.lte(0)) return InvoiceStatus.UNPAID;
  if (p.gte(dec(total))) return InvoiceStatus.PAID;
  return InvoiceStatus.PARTIAL;
}

export function outstanding(total: Money, paid: Money) {
  return dec(total).sub(dec(paid));
}

/**
 * Sisa tagihan dalam IDR = sisa (mata uang invoice) x kurs invoice.
 * Pakai kurs invoice (nilai buku), bukan kurs pembayaran: selisih kurs belum dibukukan,
 * jadi invoice lunas selalu sisa base 0.
 */
export function outstandingBase(total: Money, paid: Money, rate: Money = 1) {
  return toBase(outstanding(total, paid), rate);
}

/**
 * "Hari ini" versi WIB, sebagai Date UTC tengah malam (sama format dengan dueDate
 * yang disimpan dari input `YYYY-MM-DD`). WIB = UTC+7 tanpa DST.
 */
export function todayWib(now: Date = new Date()) {
  const wib = new Date(now.getTime() + 7 * 3600_000);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
}

/** Tanggal (UTC tengah malam) + n hari. */
export function addDays(date: Date, days: number) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Jatuh tempo lewat = dueDate sebelum hari ini dan belum lunas. Jatuh tempo HARI INI belum overdue. */
export function isOverdue(inv: { dueDate: Date; status: InvoiceStatus }, now: Date = new Date()) {
  return inv.status !== InvoiceStatus.PAID && inv.dueDate < todayWib(now);
}

export function daysOverdue(dueDate: Date, now: Date = new Date()) {
  return Math.floor((todayWib(now).getTime() - dueDate.getTime()) / 86_400_000);
}

export interface AgingBuckets {
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90plus: string;
}

/**
 * Aging piutang/hutang: kelompokkan sisa tagihan per umur keterlambatan.
 * Nilainya dalam IDR (sisa x `exchangeRate` invoice) supaya invoice beda mata uang bisa dijumlah.
 */
export function agingBuckets(
  invoices: { dueDate: Date; totalAmount: Money; paidAmount: Money; exchangeRate?: Money }[],
  now: Date = new Date(),
): AgingBuckets {
  const b = {
    current: dec(0),
    d1_30: dec(0),
    d31_60: dec(0),
    d61_90: dec(0),
    d90plus: dec(0),
  };
  for (const inv of invoices) {
    const rest = outstandingBase(inv.totalAmount, inv.paidAmount, inv.exchangeRate ?? 1);
    const late = daysOverdue(inv.dueDate, now);
    const key: keyof typeof b =
      late <= 0 ? 'current' : late <= 30 ? 'd1_30' : late <= 60 ? 'd31_60' : late <= 90 ? 'd61_90' : 'd90plus';
    b[key] = b[key].add(rest);
  }
  return {
    current: b.current.toFixed(2),
    d1_30: b.d1_30.toFixed(2),
    d31_60: b.d31_60.toFixed(2),
    d61_90: b.d61_90.toFixed(2),
    d90plus: b.d90plus.toFixed(2),
  };
}
