const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 2,
});

/** Backend kirim Decimal sebagai string, jadi terima string | number. */
export const formatRupiah = (v: string | number) => rupiah.format(Number(v));
