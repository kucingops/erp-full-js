/**
 * Helper bulan untuk dashboard, dihitung di zona waktu bisnis (WIB, UTC+7).
 * Asia/Jakarta tidak punya DST, jadi offset tetap cukup dan tidak butuh library tanggal.
 * Query SQL memakai zona yang sama (`AT TIME ZONE 'Asia/Jakarta'`) supaya bucket cocok.
 */
export const BUSINESS_TZ = 'Asia/Jakarta';
const OFFSET_MS = 7 * 60 * 60 * 1000;

function ym(date: Date) {
  const local = new Date(date.getTime() + OFFSET_MS);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() };
}

/** Awal bulan (jam 00:00 WIB) sebagai instant UTC. `offset` = geser bulan (-1 = bulan lalu). */
export function monthStart(now: Date, offset = 0): Date {
  const { y, m } = ym(now);
  return new Date(Date.UTC(y, m + offset, 1) - OFFSET_MS);
}

/** Key `YYYY-MM` bulan berjalan (WIB). */
export function monthKey(date: Date): string {
  const { y, m } = ym(date);
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** `count` key bulan terakhir, urut dari yang paling lama sampai bulan ini. */
export function lastMonthKeys(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    monthKey(monthStart(now, i - count + 1)),
  );
}

/**
 * Isi bulan yang kosong dengan 0: SQL GROUP BY tidak mengembalikan bulan tanpa transaksi,
 * padahal chart butuh sumbu x yang lengkap.
 */
export function fillMonths<T extends { month: string }>(
  keys: string[],
  rows: T[],
  empty: Omit<T, 'month'>,
): T[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return keys.map((month) => byMonth.get(month) ?? ({ month, ...empty } as T));
}
