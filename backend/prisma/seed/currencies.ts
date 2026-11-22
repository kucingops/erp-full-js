import { Prisma, type PrismaClient } from '../../src/generated/prisma/client.js';

const CURRENCIES = [
  { code: 'IDR', name: 'Rupiah', symbol: 'Rp', decimals: 0 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'JPY', name: 'Yen', symbol: '¥', decimals: 0 },
];

/** Kurs contoh (1 unit = x IDR), berlaku 7 hari terakhir sampai hari ini. */
const SAMPLE_RATES: Record<string, number> = {
  USD: 15850,
  SGD: 11800,
  EUR: 17150,
  JPY: 105.5,
};

export async function seedCurrencies(prisma: PrismaClient) {
  for (const c of CURRENCIES) {
    await prisma.currency.upsert({ where: { code: c.code }, create: c, update: {} });
  }
  const today = new Date();
  for (let back = 7; back >= 0; back--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back));
    for (const [code, base] of Object.entries(SAMPLE_RATES)) {
      // sedikit naik-turun supaya histori kurs kelihatan
      const rate = new Prisma.Decimal(base).mul(1 + ((back % 3) - 1) * 0.002).toDecimalPlaces(6);
      await prisma.exchangeRate.upsert({
        where: { currencyCode_effectiveDate: { currencyCode: code, effectiveDate: d } },
        create: { currencyCode: code, effectiveDate: d, rate },
        update: {},
      });
    }
  }
}
