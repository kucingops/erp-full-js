"use client";

import { OrderReportView, type OrderReportConfig } from "@/features/reports/order-report-view";
import { REPORTS } from "@/features/reports/reports";

const config: OrderReportConfig = {
  report: REPORTS.find((r) => r.href === "/reports/sales")!,
  partnerLabel: "customer",
  partnerResource: "customers",
  partnerParam: "customerId",
  defaultStatusLabel: "Dikonfirmasi + dikirim",
  statuses: [
    { value: "DRAFT", label: "Draft" },
    { value: "CONFIRMED", label: "Dikonfirmasi" },
    { value: "SHIPPED", label: "Dikirim" },
    { value: "CANCELLED", label: "Dibatalkan" },
  ],
  filenamePrefix: "laporan-penjualan",
};

export default function SalesReportPage() {
  return <OrderReportView config={config} />;
}