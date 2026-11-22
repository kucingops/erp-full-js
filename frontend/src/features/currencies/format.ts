import { BASE_CURRENCY } from "./types";

const cache = new Map<string, Intl.NumberFormat>();

/**
 * Format uang sesuai kode ISO 4217 (Rp 1.500, US$ 12,50, ¥ 100).
 * Digit desimal pakai default Intl per mata uang. Kode tidak dikenal → fallback angka + kode.
 */
export function formatMoney(value: string | number, code: string = BASE_CURRENCY) {
  let fmt = cache.get(code);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: code });
    } catch {
      return `${code} ${Number(value).toLocaleString("id-ID")}`;
    }
    cache.set(code, fmt);
  }
  return fmt.format(Number(value));
}

/** Kurs ditampilkan sampai 6 desimal tanpa trailing zero: 15.850,5 */
export const formatRate = (v: string | number) =>
  Number(v).toLocaleString("id-ID", { maximumFractionDigits: 6 });

export const isForeign = (code?: string | null) => !!code && code !== BASE_CURRENCY;
