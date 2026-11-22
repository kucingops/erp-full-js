"use client";

import { PURCHASE_BILL } from "@/features/invoicing/config";
import { InvoiceListPage } from "@/features/invoicing/invoice-list-page";

export default function PurchaseBillsPage() {
  return <InvoiceListPage cfg={PURCHASE_BILL} />;
}
