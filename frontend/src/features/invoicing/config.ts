import type { Role } from "@/lib/types";
import type { Invoice } from "./types";

/**
 * Invoice penjualan (AR) dan tagihan supplier (AP) pakai komponen yang sama,
 * bedanya cuma di konfigurasi ini (komposisi lewat props, bukan copy-paste).
 */
export interface InvoiceConfig {
  /** resource API sekaligus path halaman: /api/sales-invoices ↔ /sales-invoices */
  resource: "sales-invoices" | "purchase-bills";
  title: string;
  description: string;
  docLabel: string;
  partnerLabel: string;
  orderLabel: string;
  orderPath: string;
  /** Role yang boleh tulis (sama dengan @Roles di controller backend). */
  roles: Role[];
  partnerOf: (inv: Pick<Invoice, "customer" | "supplier">) => { name: string } | null | undefined;
  orderOf: (inv: Pick<Invoice, "salesOrder" | "purchaseOrder">) => { id: string; number: string } | null;
}

export const SALES_INVOICE: InvoiceConfig = {
  resource: "sales-invoices",
  title: "Invoice Penjualan",
  description: "Piutang customer (AR) dari sales order yang sudah dikirim",
  docLabel: "Invoice",
  partnerLabel: "Customer",
  orderLabel: "Sales order",
  orderPath: "/sales-orders",
  roles: ["SALES"],
  partnerOf: (i) => i.customer,
  orderOf: (i) => i.salesOrder,
};

export const PURCHASE_BILL: InvoiceConfig = {
  resource: "purchase-bills",
  title: "Tagihan Supplier",
  description: "Hutang ke supplier (AP) dari purchase order yang sudah diterima",
  docLabel: "Tagihan",
  partnerLabel: "Supplier",
  orderLabel: "Purchase order",
  orderPath: "/purchase-orders",
  roles: ["PURCHASING"],
  partnerOf: (i) => i.supplier,
  orderOf: (i) => i.purchaseOrder,
};

/** Lookup by resource: server page cukup kirim string (fungsi tidak bisa dikirim ke Client Component). */
export const INVOICE_CONFIGS: Record<InvoiceConfig["resource"], InvoiceConfig> = {
  "sales-invoices": SALES_INVOICE,
  "purchase-bills": PURCHASE_BILL,
};
