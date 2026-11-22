"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
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
import { REPORTS } from "./reports";
import type {
  StockMovementReport,
  StockMovementRow,
  StockValuationReport,
  StockValuationRow,
} from "./types";

const VALUATION = REPORTS.find((r) => r.href === "/reports/stock-valuation")!;
const MOVEMENTS = REPORTS.find((r) => r.href === "/reports/stock-movements")!;
const dateTimeFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

/** Filter bersama dua laporan stok: gudang, kategori, cari produk. */
function useStockFilters() {
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const warehouses = useOptions("warehouses");
  const categories = useOptions("categories");

  const params = {
    warehouseId: warehouseId || undefined,
    categoryId: categoryId || undefined,
    search: debounced.trim() || undefined,
  };
  const controls = (
    <>
      <Input
        className="w-56"
        placeholder="Cari SKU / nama produk"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <FilterSelect
        ariaLabel="Gudang"
        value={warehouseId}
        onChange={setWarehouseId}
        options={warehouses.data ?? []}
        allLabel="Semua gudang"
      />
      <FilterSelect
        ariaLabel="Kategori"
        value={categoryId}
        onChange={setCategoryId}
        options={categories.data ?? []}
        allLabel="Semua kategori"
      />
    </>
  );
  return { params, controls };
}

const valuationColumns: ReportColumn<StockValuationRow>[] = [
  { key: "sku", header: "SKU", kind: "text", value: (r) => r.sku },
  { key: "name", header: "Produk", kind: "text", value: (r) => r.name },
  { key: "category", header: "Kategori", kind: "text", value: (r) => r.category },
  { key: "quantity", header: "Qty", kind: "int", value: (r) => r.quantity },
  { key: "unit", header: "Satuan", kind: "text", value: (r) => r.unit },
  { key: "costPrice", header: "Harga pokok", kind: "money", value: (r) => r.costPrice },
  { key: "value", header: "Nilai", kind: "money", value: (r) => r.value },
];

export function StockValuationView() {
  return (
    <ReportGate report={VALUATION}>
      <StockValuation />
    </ReportGate>
  );
}

function StockValuation() {
  const { params, controls } = useStockFilters();
  const query = useReport<StockValuationReport>(VALUATION.endpoint, params);
  const today = new Date().toISOString().slice(0, 10);
  const exporter = useExportReport(VALUATION.endpoint, `laporan-nilai-stok_${today}`);

  return (
    <>
      <PageHeader
        title="Laporan"
        description={VALUATION.description}
        actions={
          <ExportButtons
            pending={exporter.isPending}
            onExport={(format) => exporter.mutate({ format, params })}
          />
        }
      />
      <ReportTabs />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {controls}
        {query.data && (
          <span className="ml-auto text-xs text-muted-foreground">
            Posisi per {dateTimeFmt.format(new Date(query.data.asOf))}
          </span>
        )}
      </div>
      <ReportTable
        columns={valuationColumns}
        rows={query.data?.rows}
        totals={query.data?.totals}
        rowKey={(r) => r.productId}
        isLoading={query.isLoading}
        error={query.error}
      />
    </>
  );
}

const movementColumns: ReportColumn<StockMovementRow>[] = [
  { key: "sku", header: "SKU", kind: "text", value: (r) => r.sku },
  { key: "name", header: "Produk", kind: "text", value: (r) => r.name },
  { key: "unit", header: "Satuan", kind: "text", value: (r) => r.unit },
  { key: "opening", header: "Saldo awal", kind: "int", value: (r) => r.opening },
  { key: "inQty", header: "Masuk", kind: "int", value: (r) => r.inQty },
  { key: "outQty", header: "Keluar", kind: "int", value: (r) => r.outQty },
  { key: "adjustment", header: "Penyesuaian", kind: "int", value: (r) => r.adjustment },
  { key: "closing", header: "Saldo akhir", kind: "int", value: (r) => r.closing },
];

export function StockMovementsView() {
  return (
    <ReportGate report={MOVEMENTS}>
      <StockMovements />
    </ReportGate>
  );
}

function StockMovements() {
  const [range, setRange] = useState(defaultRange);
  const { params: stockParams, controls } = useStockFilters();
  const params = { ...stockParams, from: range.from || undefined, to: range.to || undefined };
  const query = useReport<StockMovementReport>(MOVEMENTS.endpoint, params);
  const exporter = useExportReport(
    MOVEMENTS.endpoint,
    `laporan-mutasi-stok_${range.from}_${range.to}`,
  );

  return (
    <>
      <PageHeader
        title="Laporan"
        description={MOVEMENTS.description}
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
        {controls}
      </div>
      <ReportTable
        columns={movementColumns}
        rows={query.data?.rows}
        totals={query.data?.totals}
        rowKey={(r) => r.productId}
        isLoading={query.isLoading}
        error={query.error}
      />
    </>
  );
}
