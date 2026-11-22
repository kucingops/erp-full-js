/**
 * Nomor dokumen transaksi: `<PREFIX>-YYYYMMDD-XXXX`, contoh `PO-20261122-0007`.
 * Urutan direset tiap hari. Fungsi ini murni (tanpa DB) supaya gampang di-test;
 * service yang mencari nomor terakhir hari itu lalu memanggil `nextDocNumber`.
 */
export function docNumberPrefix(prefix: string, date: Date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${prefix}-${y}${m}${d}-`;
}

/** @param last nomor terakhir hari ini (atau null kalau belum ada) */
export function nextDocNumber(dayPrefix: string, last: string | null | undefined) {
  const seq = last ? Number(last.slice(dayPrefix.length)) + 1 : 1;
  return `${dayPrefix}${String(seq).padStart(4, '0')}`;
}
