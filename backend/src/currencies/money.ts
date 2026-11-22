import { Prisma } from '../generated/prisma/client.js';

/** Mata uang dasar perusahaan. Semua laporan & dashboard dihitung di sini. */
export const BASE_CURRENCY = 'IDR';

type DecimalLike = Prisma.Decimal | number | string;

/**
 * Konversi nominal dokumen ke base currency: `amount * rate`, dibulatkan 2 desimal
 * (HALF_UP, sama dengan kolom Decimal(15,2)). Pakai Decimal, bukan float.
 */
export function toBase(amount: DecimalLike, rate: DecimalLike): Prisma.Decimal {
  return new Prisma.Decimal(amount)
    .mul(new Prisma.Decimal(rate))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Konversi silang A → B lewat base: amount * rateA / rateB.
 * `rateX` = nilai 1 unit X dalam base (base sendiri = 1).
 */
export function crossConvert(
  amount: DecimalLike,
  fromRate: DecimalLike,
  toRate: DecimalLike,
): Prisma.Decimal {
  return new Prisma.Decimal(amount)
    .mul(new Prisma.Decimal(fromRate))
    .div(new Prisma.Decimal(toRate))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Tanggal kalender WIB (Asia/Jakarta, UTC+7 tanpa DST) sebagai Date jam 00:00 UTC,
 * cocok untuk dibandingkan dengan kolom `@db.Date`.
 * Contoh: 2026-11-21T18:30Z (= 22 Nov 01:30 WIB) → 2026-11-22T00:00Z.
 */
export function wibDate(date: Date): Date {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}
