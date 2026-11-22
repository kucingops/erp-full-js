"use client";

import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { DataTable, type DataTableColumns } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MOVEMENTS_KEY } from "@/features/inventory/api";
import { InventoryTabs } from "@/features/inventory/inventory-tabs";
import {
  MOVEMENT_TYPE_LABEL,
  REFERENCE_TYPE_LABEL,
  type StockMovement,
  type StockMovementType,
} from "@/features/inventory/types";
import { WarehouseFilter } from "@/features/inventory/warehouse-filter";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
const TYPES = Object.keys(MOVEMENT_TYPE_LABEL) as StockMovementType[];
const ALL = "all";

const TYPE_VARIANT: Record<StockMovementType, "default" | "destructive" | "secondary"> = {
  IN: "default",
  OUT: "destructive",
  ADJUSTMENT: "secondary",
};

const columns: DataTableColumns<StockMovement> = [
  {
    accessorKey: "createdAt",
    header: "Waktu",
    cell: ({ row }) => dateFmt.format(new Date(row.original.createdAt)),
  },
  {
    id: "product",
    header: "Produk",
    cell: ({ row }) => (
      <div>
        <div>{row.original.product.name}</div>
        <div className="font-mono text-xs text-muted-foreground">{row.original.product.sku}</div>
      </div>
    ),
  },
  { id: "warehouse", header: "Gudang", cell: ({ row }) => row.original.warehouse.name },
  {
    accessorKey: "type",
    header: "Tipe",
    cell: ({ row }) => (
      <Badge variant={TYPE_VARIANT[row.original.type]}>{MOVEMENT_TYPE_LABEL[row.original.type]}</Badge>
    ),
  },
  {
    accessorKey: "quantity",
    header: "Jumlah",
    cell: ({ row }) => {
      const q = row.original.quantity;
      return (
        <span className={q > 0 ? "text-green-600 tabular-nums" : "text-destructive tabular-nums"}>
          {q > 0 ? `+${q}` : q}
        </span>
      );
    },
  },
  {
    accessorKey: "balanceAfter",
    header: "Saldo",
    cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.balanceAfter}</span>,
  },
  {
    id: "reference",
    header: "Referensi",
    cell: ({ row }) => (
      <div className="text-sm">
        <div>{REFERENCE_TYPE_LABEL[row.original.referenceType]}</div>
        {row.original.note && (
          <div className="max-w-64 truncate text-xs text-muted-foreground" title={row.original.note}>
            {row.original.note}
          </div>
        )}
      </div>
    ),
  },
  { id: "createdBy", header: "Oleh", cell: ({ row }) => row.original.createdBy?.name ?? "-" },
];

/** useSearchParams wajib di dalam Suspense supaya halaman tetap bisa di-prerender. */
export default function MovementsPage() {
  return (
    <Suspense>
      <Movements />
    </Suspense>
  );
}

function Movements() {
  const router = useRouter();
  const params = useSearchParams();
  // Filter produk datang dari link "Kartu stok" di halaman stok.
  const productId = params.get("productId") ?? "";
  const [warehouseId, setWarehouseId] = useState(params.get("warehouseId") ?? "");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<StockMovementType | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const debouncedSearch = useDebounce(search);

  const query = useListQuery<StockMovement>(MOVEMENTS_KEY, {
    page,
    limit: 20,
    search: debouncedSearch,
    productId,
    warehouseId,
    type,
    // Tanggal dikirim sebagai batas hari waktu lokal (WIB), bukan UTC.
    dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
    dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const productName = productId ? query.data?.data[0]?.product.name : undefined;

  return (
    <>
      <PageHeader title="Inventory" description="Kartu stok: riwayat semua barang masuk, keluar, dan penyesuaian" />
      <InventoryTabs />
      {productId && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Produk:</span>
          <Badge variant="outline">{productName ?? "terpilih"}</Badge>
          <Button variant="ghost" size="xs" onClick={() => router.replace("/inventory/movements")}>
            <X /> Hapus filter
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        result={query.data}
        isLoading={query.isLoading}
        search={productId ? undefined : search}
        onSearchChange={productId ? undefined : reset(setSearch)}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <WarehouseFilter value={warehouseId} onChange={reset(setWarehouseId)} />
            <Select
              value={type || ALL}
              onValueChange={(v) => reset(setType)(v === ALL || !v ? "" : (v as StockMovementType))}
            >
              <SelectTrigger className="w-40">
                <SelectValue>
                  {(v: string) => (v === ALL ? "Semua tipe" : MOVEMENT_TYPE_LABEL[v as StockMovementType])}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua tipe</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {MOVEMENT_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              className="w-40"
              aria-label="Dari tanggal"
              value={dateFrom}
              onChange={(e) => reset(setDateFrom)(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">s/d</span>
            <Input
              type="date"
              className="w-40"
              aria-label="Sampai tanggal"
              value={dateTo}
              onChange={(e) => reset(setDateTo)(e.target.value)}
            />
          </div>
        }
      />
    </>
  );
}
