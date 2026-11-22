"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { CurrencySelect } from "@/features/currencies/components";
import { formatMoney, isForeign } from "@/features/currencies/format";
import { BASE_CURRENCY } from "@/features/currencies/types";
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
  const [currencyCode, setCurrencyCode] = useState<string | null>(null);

  const partners = useOptions(config.partnerResource);
  const warehouses = useOptions("warehouses");
  const params = {
    from: range.from || undefined,
    to: range.to || undefined,
    groupBy,
    [config.partnerParam]: partnerId || undefined,
    warehouseId: warehouseId || undefined,
    status: status || undefined,
    currencyCode: currencyCode ?? undefined,
  };
  const query = useReport<OrderReport>(config.report.endpoint, params);
  const exporter = useExportReport(
    config.report.endpoint,
    `${config.filenamePrefix}_${groupBy}_${range.from}_${range.to}${currencyCode ? `_${currencyCode}` : ""}`,
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
        <div className="w-48">
          <CurrencySelect
            value={currencyCode}
            onChange={setCurrencyCode}
            allowEmpty
            emptyLabel="Semua mata uang"
          />
        </div>
      </div>
      <ReportTable
        columns={orderColumns(groupBy, config.partnerLabel, query.data?.docCurrency ?? null)}
        rows={query.data?.rows}
        totals={query.data?.totals}
        rowKey={(r) => r.key}
        isLoading={query.isLoading}
        error={query.error}
      />
      <CurrencyBreakdown report={query.data} />
    </>
  );
}

/** Rincian per mata uang dokumen; disembunyikan kalau semuanya IDR. */
function CurrencyBreakdown({ report }: { report?: OrderReport }) {
  if (!report?.currencies.some((c) => isForeign(c.currencyCode))) return null;
  return (
    <div className="mt-4 rounded-lg border p-4 text-sm">
      <p className="mb-2 font-medium">Per mata uang dokumen</p>
      <div className="grid gap-1">
        {report.currencies.map((c) => (
          <div key={c.currencyCode} className="flex justify-between gap-4 tabular-nums">
            <span>
              {c.currencyCode} <span className="text-muted-foreground">({c.orderCount} dokumen)</span>
            </span>
            <span>
              {formatMoney(c.total, c.currencyCode)}
              {isForeign(c.currencyCode) && (
                <span className="text-muted-foreground"> ≈ {formatMoney(c.totalBase)}</span>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Total di tabel dalam {report.baseCurrency}, dikonversi dengan kurs yang tersimpan di tiap dokumen.
      </p>
    </div>
  );
}

function orderColumns(
  groupBy: OrderGroupBy,
  partnerLabel: string,
  docCurrency: string | null,
): ReportColumn<OrderReportRow>[] {
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
    // Kolom mata uang dokumen hanya kalau semua dokumen satu mata uang asing.
    ...(docCurrency && isForeign(docCurrency)
      ? [
          {
            key: "totalDoc",
            header: `Total (${docCurrency})`,
            kind: "money" as const,
            currency: docCurrency,
            value: (r: OrderReportRow) => r.totalDoc,
          },
        ]
      : []),
    { key: "total", header: `Total (${BASE_CURRENCY})`, kind: "money", value: (r) => r.total },
  ];
}
