import { BadRequestException } from '@nestjs/common';

/** WIB = UTC+7, tanpa DST. Sama dengan dashboard. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Batas rentang supaya laporan harian tidak meledak jadi ribuan baris. */
export const MAX_RANGE_DAYS = 366 * 3;

export interface ReportPeriod {
  /** 'YYYY-MM-DD' (WIB), inklusif */
  from: string;
  /** 'YYYY-MM-DD' (WIB), inklusif */
  to: string;
  /** Instant UTC 00:00 WIB tanggal `from` */
  start: Date;
  /** Instant UTC 00:00 WIB sehari setelah `to` (eksklusif) */
  end: Date;
}

/** Tanggal kalender WIB dari sebuah instant, format 'YYYY-MM-DD'. */
export function wibDateKey(at: Date): string {
  return new Date(at.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00 WIB tanggal `key` sebagai instant UTC. */
export function wibStartOfDay(key: string): Date {
  return new Date(Date.parse(`${key}T00:00:00Z`) - WIB_OFFSET_MS);
}

/**
 * Ubah filter tanggal dari user (tanggal kalender WIB, inklusif) jadi rentang
 * setengah-terbuka [start, end) untuk SQL. Default: awal bulan ini s/d hari ini.
 *
 * Kenapa half-open? `order_date < end` tidak perlu mikirin 23:59:59.999,
 * dan tidak ada transaksi yang jatuh di celah milidetik.
 */
export function resolvePeriod(from?: string, to?: string, now = new Date()): ReportPeriod {
  const today = wibDateKey(now);
  const toKey = to ?? today;
  const fromKey = from ?? `${toKey.slice(0, 7)}-01`;
  const start = wibStartOfDay(fromKey);
  const end = new Date(wibStartOfDay(toKey).getTime() + DAY_MS);

  if (start >= end) {
    throw new BadRequestException('Tanggal "dari" tidak boleh setelah tanggal "sampai"');
  }
  if ((end.getTime() - start.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
    throw new BadRequestException(`Rentang laporan maksimal ${MAX_RANGE_DAYS} hari`);
  }
  return { from: fromKey, to: toKey, start, end };
}
