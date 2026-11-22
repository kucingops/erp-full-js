// Tipe response /api/currencies & /api/exchange-rates. Decimal datang sebagai string.

/** Mata uang dasar. Harus sama dengan BASE_CURRENCY di backend (src/currencies/money.ts). */
export const BASE_CURRENCY = "IDR";

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  isActive: boolean;
  isBase: boolean;
  /** Kurs terakhir (1 unit = x IDR). IDR selalu "1". null = belum pernah diinput. */
  latestRate: { rate: string; effectiveDate: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRate {
  id: string;
  currencyCode: string;
  effectiveDate: string;
  rate: string;
  currency: { code: string; name: string; symbol: string };
}

export interface ConvertResult {
  amount: string;
  from: string;
  to: string;
  date: string;
  fromRate: string;
  toRate: string;
  result: string;
}

/** Field mata uang yang ditambahkan ke PO/SO (additive). */
export interface DocCurrency {
  currencyCode: string;
  exchangeRate: string;
  totalAmountBase: string;
}
