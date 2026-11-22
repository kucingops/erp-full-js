import { AccountType } from '../generated/prisma/enums.js';

/**
 * Bagan akun (COA) standar yang dibutuhkan posting otomatis.
 * Kode dipakai sebagai "alamat" akun di posting rules, jadi rules tidak bergantung pada UUID.
 * Dibuat otomatis (upsert) oleh seed DAN oleh `JournalPostingService` sebelum posting,
 * jadi jurnal otomatis tetap jalan walau seed belum dijalankan.
 *
 * Akun header (isPostable=false) cuma untuk pengelompokan di tampilan COA.
 */
export const ACC = {
  CASH: '1101',
  BANK: '1102',
  RECEIVABLE: '1200',
  INVENTORY: '1300',
  PAYABLE: '2100',
  /** Hutang barang diterima belum ditagih (GR/IR clearing). */
  GRNI: '2110',
  CAPITAL: '3100',
  RETAINED_EARNINGS: '3200',
  SALES: '4100',
  COGS: '5100',
  INVENTORY_ADJUSTMENT: '5200',
  PURCHASE_PRICE_VARIANCE: '5300',
  FX_GAIN_LOSS: '7100',
} as const;

export type AccountCode = (typeof ACC)[keyof typeof ACC];

export interface AccountDef {
  code: string;
  name: string;
  type: AccountType;
  parent?: string;
  isPostable: boolean;
  description?: string;
}

const header = (code: string, name: string, type: AccountType): AccountDef => ({
  code,
  name,
  type,
  isPostable: false,
});

export const SYSTEM_ACCOUNTS: AccountDef[] = [
  header('1000', 'Aset', AccountType.ASSET),
  header('1100', 'Kas & Bank', AccountType.ASSET),
  { code: ACC.CASH, name: 'Kas', type: AccountType.ASSET, parent: '1100', isPostable: true, description: 'Pembayaran metode CASH' },
  { code: ACC.BANK, name: 'Bank', type: AccountType.ASSET, parent: '1100', isPostable: true, description: 'Pembayaran metode TRANSFER / OTHER' },
  { code: ACC.RECEIVABLE, name: 'Piutang Usaha', type: AccountType.ASSET, parent: '1000', isPostable: true },
  { code: ACC.INVENTORY, name: 'Persediaan Barang', type: AccountType.ASSET, parent: '1000', isPostable: true, description: 'Dinilai dengan harga standar (costPrice produk)' },

  header('2000', 'Kewajiban', AccountType.LIABILITY),
  { code: ACC.PAYABLE, name: 'Hutang Usaha', type: AccountType.LIABILITY, parent: '2000', isPostable: true },
  { code: ACC.GRNI, name: 'Hutang Barang Belum Ditagih', type: AccountType.LIABILITY, parent: '2000', isPostable: true, description: 'Penampung saat PO diterima, dinolkan saat tagihan supplier dibuat' },

  header('3000', 'Ekuitas', AccountType.EQUITY),
  { code: ACC.CAPITAL, name: 'Modal Disetor', type: AccountType.EQUITY, parent: '3000', isPostable: true },
  { code: ACC.RETAINED_EARNINGS, name: 'Laba Ditahan', type: AccountType.EQUITY, parent: '3000', isPostable: true },

  header('4000', 'Pendapatan', AccountType.REVENUE),
  { code: ACC.SALES, name: 'Penjualan', type: AccountType.REVENUE, parent: '4000', isPostable: true },

  header('5000', 'Beban Pokok', AccountType.EXPENSE),
  { code: ACC.COGS, name: 'Harga Pokok Penjualan', type: AccountType.EXPENSE, parent: '5000', isPostable: true },
  { code: ACC.INVENTORY_ADJUSTMENT, name: 'Selisih Persediaan', type: AccountType.EXPENSE, parent: '5000', isPostable: true, description: 'Penyesuaian / opname stok' },
  { code: ACC.PURCHASE_PRICE_VARIANCE, name: 'Selisih Harga Beli', type: AccountType.EXPENSE, parent: '5000', isPostable: true, description: 'Harga PO vs harga standar' },

  header('7000', 'Pendapatan & Beban Lain', AccountType.EXPENSE),
  { code: ACC.FX_GAIN_LOSS, name: 'Laba/Rugi Selisih Kurs', type: AccountType.EXPENSE, parent: '7000', isPostable: true, description: 'Kurs bayar vs kurs invoice' },
];

/** Saldo normal: aset & beban di debit, sisanya di kredit. */
export function isDebitNormal(type: AccountType) {
  return type === AccountType.ASSET || type === AccountType.EXPENSE;
}
