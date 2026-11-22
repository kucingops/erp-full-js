"use client";

import { OrderReportView, type OrderReportConfig } from "@/features/reports/order-report-view";
import { REPORTS } from "@/features/reports/reports";

const config: OrderReportConfig = {
  report: REPORTS.find((r) => r.href === "/reports/purchases")!,
  partnerLabel: "supplier",
  partnerResource: "suppliers",
  partnerParam: "supplierId",
  defaultStatusLabel: "Di-approve + diterima",
  statuses: [
    { value: "DRAFT", label: "Draft" },
    { value: "APPROVED", label: "Di-approve" },
    { value: "RECEIVED", label: "Diterima" },
    { value: "CANCELLED", label: "Dibatalkan" },
  ],
  filenamePrefix: "laporan-pembelian",
};

export default function PurchaseReportPage() {
  return <OrderReportView config={config} />;
}