"use client";

import { PageHeader } from "@/components/page-header";
import { SalesOrderForm } from "@/features/sales-orders/sales-order-form";

export default function NewSalesOrderPage() {
  return (
    <>
      <PageHeader title="Buat Sales Order" description="SO baru disimpan sebagai draft" />
      <SalesOrderForm />
    </>
  );
}
