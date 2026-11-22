/**
 * Formatter angka & tanggal untuk dokumen cetak (locale id-ID, zona WIB).
 * Fungsi murni, tanpa Nest/Prisma, supaya gampang dites.
 */

type Numeric = string | number | { toString(): string };

const amountFmt = new Map<string, Intl.NumberFormat>();

/** Digit desimal default Intl/CLDR per mata uang (locale id-ID: IDR 0, USD 2, JPY 0). Kode aneh → 2. */
function fractionDigits(code: string) {
  try {
    return (
      new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: code,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** Angka uang tanpa simbol: `1.234.567,50`. Digit desimal mengikuti mata uang. */
export function formatAmount(value: Numeric, code = 'IDR') {
  let fmt = amountFmt.get(code);
  if (!fmt) {
    const digits = fractionDigits(code);
    fmt = new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    amountFmt.set(code, fmt);
  }
  return clean(fmt.format(Number(value.toString())));
}

/** Uang dengan kode mata uang di depan: `IDR 1.234.567,50`, `USD 12,50`. */
export function formatMoney(value: Numeric, code = 'IDR') {
  return `${code} ${formatAmount(value, code)}`;
}

/** Kurs sampai 6 desimal tanpa trailing zero: `15.850,5`. */
export function formatRate(value: Numeric) {
  return clean(
    Number(value.toString()).toLocaleString('id-ID', {
      maximumFractionDigits: 6,
    }),
  );
}

export function formatQty(value: number) {
  return value.toLocaleString('id-ID');
}

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

/** `22 November 2026` (tanggal WIB). null → `-`. */
export function formatDate(value: Date | null | undefined) {
  return value ? dateFmt.format(value) : '-';
}

/** Spasi khusus dari Intl (nbsp / narrow nbsp) diganti spasi biasa supaya aman di font standar PDF. */
function clean(s: string) {
  return s.replace(/[  ]/g, ' ');
}
