"use client";

import { SALES_INVOICE } from "@/features/invoicing/config";
import { InvoiceListPage } from "@/features/invoicing/invoice-list-page";

export default function SalesInvoicesPage() {
  return <InvoiceListPage cfg={SALES_INVOICE} />;
}
