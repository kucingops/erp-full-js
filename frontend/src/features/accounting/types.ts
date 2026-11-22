/** Tipe response modul akuntansi. Uang dari backend berupa string Decimal → parse dengan Number(). */

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type JournalSourceType = "MANUAL" | "SALES_INVOICE" | "PURCHASE_BILL" | "PAYMENT" | "STOCK_MOVEMENT";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ASSET: "Aset",
  LIABILITY: "Kewajiban",
  EQUITY: "Ekuitas",
  REVENUE: "Pendapatan",
  EXPENSE: "Beban",
};

export const SOURCE_LABEL: Record<JournalSourceType, string> = {
  MANUAL: "Manual",
  SALES_INVOICE: "Invoice penjualan",
  PURCHASE_BILL: "Tagihan supplier",
  PAYMENT: "Pembayaran",
  STOCK_MOVEMENT: "Mutasi stok",
};

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  parent?: { id: string; code: string; name: string } | null;
  isPostable: boolean;
  isSystem: boolean;
  isActive: boolean;
  description: string | null;
  _count?: { lines: number };
}

export interface JournalLine {
  id: string;
  lineNo: number;
  accountId: string;
  debit: string;
  credit: string;
  description: string | null;
  account: { id: string; code: string; name: string; type: AccountType };
}

export interface JournalEntry {
  id: string;
  number: string;
  date: string;
  description: string;
  sourceType: JournalSourceType;
  sourceId: string | null;
  sourceNumber: string | null;
  reversalOfId: string | null;
  reversalOf?: { id: string; number: string } | null;
  reversedBy?: { id: string; number: string } | null;
  totalAmount: string;
  lines: JournalLine[];
}

export interface LedgerRow {
  id: string;
  entryId: string;
  number: string;
  date: string;
  description: string;
  sourceType: JournalSourceType;
  sourceNumber: string | null;
  debit: string;
  credit: string;
  balance: string;
}

export interface GeneralLedger {
  account: Pick<Account, "id" | "code" | "name" | "type">;
  from: string | null;
  to: string;
  openingBalance: string;
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  rows: LedgerRow[];
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  openingBalance: string;
  debit: string;
  credit: string;
  closingBalance: string;
  closingDebit: string;
  closingCredit: string;
}

export interface TrialBalance {
  from: string | null;
  to: string;
  rows: TrialBalanceRow[];
  total: { debit: string; credit: string; closingDebit: string; closingCredit: string };
  balanced: boolean;
}
