const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" });
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

/** Decimal dari backend berupa string → number → Rupiah. */
export const formatIDR = (v: string | number) => currency.format(Number(v));
export const formatDate = (v: string) => date.format(new Date(v));
