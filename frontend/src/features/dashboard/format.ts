const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const idrCompact = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const num = new Intl.NumberFormat("id-ID");
const monthFmt = new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit", timeZone: "UTC" });

export const formatIDR = (v: number | string) => idr.format(Number(v));
/** Untuk label sumbu chart: "Rp 1,5 jt" */
export const formatIDRCompact = (v: number | string) => idrCompact.format(Number(v));
export const formatNumber = (v: number) => num.format(v);

/** "2026-11" -> "Nov 26" */
export function formatMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Perubahan persen terhadap periode sebelumnya. null kalau periode sebelumnya 0. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
