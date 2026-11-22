"use client";

import { PageHeader } from "@/components/page-header";
import { StockTransferForm } from "@/features/stock-ops/transfer-form";

export default function NewStockTransferPage() {
  return (
    <>
      <PageHeader
        title="Buat Transfer Stok"
        description="Disimpan sebagai draft; stok baru berpindah saat dikirim & diterima"
      />
      <StockTransferForm />
    </>
  );
}
