// Tipe response /api/sales-invoices & /api/purchase-bills (bentuknya sama).
// Uang (Decimal) datang sebagai string → parse dengan Number().

export type InvoiceStatus = "UNPAID" | "PARTIAL" | "PAID";
export type PaymentMethod = "CASH" | "TRANSFER" | "OTHER";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  UNPAID: "Belum dibayar",
  PARTIAL: "Dibayar sebagian",
  PAID: "Lunas",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer",
  OTHER: "Lainnya",
};

interface PartnerRef {
  id: string;
  code: string;
  name: string;
}

interface OrderRef {
  id: string;
  number: string;
  orderDate: string;
}

export interface Invoice {
  id: string;
  number: string;
  type: "SALES" | "PURCHASE";
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  /** Mata uang invoice (= mata uang order). Nominal di atas dalam mata uang ini. */
  currencyCode: string;
  /** 1 currencyCode = exchangeRate IDR */
  exchangeRate: string;
  totalAmountBase: string;
  /** Sisa dalam IDR (kurs invoice) */
  outstandingAmountBase: string;
  isOverdue: boolean;
  notes: string | null;
  customer: PartnerRef | null;
  supplier: PartnerRef | null;
  salesOrder: OrderRef | null;
  purchaseOrder: OrderRef | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  /** dalam mata uang invoice */
  amount: string;
  exchangeRate: string;
  amountBase: string;
  paidAt: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  createdBy: { id: string; name: string };
}

export interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  product: { id: string; sku: string; name: string; unit: string };
}

export interface InvoiceDetail extends Invoice {
  salesOrder: (OrderRef & { items: OrderItem[] }) | null;
  purchaseOrder: (OrderRef & { items: OrderItem[] }) | null;
  createdBy: { id: string; name: string };
  payments: Payment[];
}

/** Order SO SHIPPED / PO RECEIVED yang belum punya invoice. */
export interface InvoiceCandidate {
  id: string;
  number: string;
  orderDate: string;
  totalAmount: string;
  currencyCode: string;
  exchangeRate: string;
  totalAmountBase: string;
  customer?: PartnerRef;
  supplier?: PartnerRef;
}

/** Semua nominal ringkasan dalam IDR (baseCurrency); byCurrency = rincian per mata uang asli. */
export interface InvoiceSummary {
  baseCurrency: string;
  openCount: number;
  totalOutstanding: string;
  overdueCount: number;
  overdueAmount: string;
  aging: Record<"current" | "d1_30" | "d31_60" | "d61_90" | "d90plus", string>;
  topPartners: { id: string; code: string; name: string; outstanding: string; count: number }[];
  byCurrency: { currencyCode: string; outstanding: string; outstandingBase: string; count: number }[];
}
