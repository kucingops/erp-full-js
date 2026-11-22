"use client";

import { PageHeader } from "@/components/page-header";
import { PurchaseOrderForm } from "@/features/purchase-orders/purchase-order-form";

export default function NewPurchaseOrderPage() {
  return (
    <>
      <PageHeader title="Buat Purchase Order" description="PO baru disimpan sebagai draft" />
      <PurchaseOrderForm />
    </>
  );
}
