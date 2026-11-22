"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useExportReport, useOptions, useReport } from "./api";
import { ReportTabs } from "./report-tabs";
import {
  DateRange,
  defaultRange,
  ExportButtons,
  FilterSelect,
  ReportGate,
  ReportTable,
  type ReportColumn,
} from "./report-ui";
import type { ReportDef } from "./reports";
import type { OrderGroupBy, OrderReport, OrderReportRow } from "./types";

/**
 * Konfigurasi pembeda laporan penjualan vs pembelian. Satu komponen dipakai dua halaman
 * (komposisi lewat props), sama seperti backend memakai satu query builder.
 */
export interface OrderReportConfig {
  report: ReportDef;
  /** "customer" / "supplier" */
  partnerLabel: string;
  /** resource master data untuk dropdown partner */
  partnerResource: "customers" | "suppliers";
  /** nama query param filter partner di backend */
  partnerParam: "customerId" | "supplierId";
  statuses: { value: string; label: string }[];
  defaultStatusLabel: string;
  filenamePrefix: string;
}

export function OrderReportView({ config }: { config: OrderReportConfig }) {
  return (
    <ReportGate report={config.report}>
      <OrderReportContent config={config} />
    </ReportGate>
  );
}

function OrderReportContent({ config }: { config: OrderReportConfig }) {
  const [range, setRange] = useState(defaultRange);
  const [groupBy, setGroupBy] = useState<OrderGroupBy>("month");
  const [partnerId, setPartnerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [status, setStatus] = useState("");

  const partners = useOptions(config.partnerResource);
  const warehouses = useOptions("warehouses");
  const params = {
    from: range.from || undefined,
    to: range.to || undefined,
    groupBy,
    [config.partnerParam]: partnerId || undefined,
    warehouseId: warehouseId || undefined,
    status: status || undefined,
  };
  const query = useReport<OrderReport>(config.report.endpoint, params);
  const exporter = useExportReport(
    config.report.endpoint,
    `${config.filenamePrefix}_${groupBy}_${range.from}_${range.to}`,
  );

  const groupOptions = [
    { value: "day", label: "Per hari" },
    { value: "month", label: "Per bulan" },
    { value: "partner", label: `Per ${config.partnerLabel}` },
    { value: "product", label: "Per produk" },
  ];

  return (
    <>
      <PageHeader
        title="Laporan"
        description={config.report.description}
        actions={
          <ExportButtons
            pending={exporter.isPending}
            onExport={(format) => exporter.mutate({ format, params })}
          />
        }
      />
      <ReportTabs />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRange from={range.from} to={range.to} onChange={setRange} />
        <FilterSelect
          ariaLabel="Kelompokkan"
          className="w-40"
          value={groupBy}
          onChange={(v) => setGroupBy((v || "month") as OrderGroupBy)}
          options={groupOptions}
        />
        <FilterSelect
          ariaLabel={config.partnerLabel}
          value={partnerId}
          onChange={setPartnerId}
          options={partners.data ?? []}
          allLabel={`Semua ${config.partnerLabel}`}
          className="w-56"
        />
        <FilterSelect
          ariaLabel="Gudang"
          value={warehouseId}
          onChange={setWarehouseId}
          options={warehouses.data ?? []}
          allLabel="Semua gudang"
        />
        <FilterSelect
          ariaLabel="Status"
          value={status}
          onChange={setStatus}
          options={config.statuses}
          allLabel={config.defaultStatusLabel}
          className="w-56"
        />
      </div>
      <ReportTable
        columns={orderColumns(groupBy, config.partnerLabel)}
        rows={query.data?.rows}
        totals={query.data?.totals}
        rowKey={(r) => r.key}
        isLoading={query.isLoading}
        error={query.error}
      />
    </>
  );
}

function orderColumns(groupBy: OrderGroupBy, partnerLabel: string): ReportColumn<OrderReportRow>[] {
  const isPeriod = groupBy === "day" || groupBy === "month";
  const groupHeader = {
    day: "Tanggal",
    month: "Bulan",
    partner: partnerLabel[0].toUpperCase() + partnerLabel.slice(1),
    product: "Produk",
  }[groupBy];
  return [
    ...(isPeriod
      ? []
      : [
          {
            key: "code",
            header: groupBy === "product" ? "SKU" : "Kode",
            kind: "text" as const,
            value: (r: OrderReportRow) => r.code,
          },
        ]),
    { key: "label", header: groupHeader, kind: "text", value: (r) => r.label },
    { key: "orderCount", header: "Jumlah dokumen", kind: "int", value: (r) => r.orderCount },
    { key: "quantity", header: "Qty", kind: "int", value: (r) => r.quantity },
    { key: "total", header: "Total", kind: "money", value: (r) => r.total },
  ];
}
