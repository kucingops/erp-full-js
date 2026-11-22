"use client";

import { Eye, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DataTable, type DataTableColumns } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WarehouseFilter } from "@/features/inventory/warehouse-filter";
import { STOCK_OPNAMES_KEY } from "@/features/stock-ops/api";
import { formatDateTime, OpnameStatusBadge } from "@/features/stock-ops/components";
import { OpnameCreateDialog } from "@/features/stock-ops/opname-create-dialog";
import {
  OPNAME_STATUS_LABEL,
  type StockOpname,
  type StockOpnameStatus,
} from "@/features/stock-ops/types";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";

const STATUSES = Object.keys(OPNAME_STATUS_LABEL) as StockOpnameStatus[];
type StatusFilter = StockOpnameStatus | "ALL";

const columns: DataTableColumns<StockOpname> = [
  {
    accessorKey: "number",
    header: "No. Opname",
    cell: ({ row }) => (
      <Link className="font-medium hover:underline" href={`/stock-opnames/${row.original.id}`}>
        {row.original.number}
      </Link>
    ),
  },
  {
    accessorKey: "snapshotAt",
    header: "Snapshot",
    cell: ({ row }) => formatDateTime(row.original.snapshotAt),
  },
  { id: "warehouse", header: "Gudang", cell: ({ row }) => row.original.warehouse.name },
  { id: "lines", header: "Produk", cell: ({ row }) => row.original._count?.lines ?? "-" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <OpnameStatusBadge status={row.original.status} />,
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Lihat detail"
        render={<Link href={`/stock-opnames/${row.original.id}`} />}
      >
        <Eye />
      </Button>
    ),
  },
];

export default function StockOpnamesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [warehouseId, setWarehouseId] = useState("");
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebounce(search);

  const query = useListQuery<StockOpname>(STOCK_OPNAMES_KEY, {
    page,
    limit: 10,
    search: debouncedSearch,
    status: status === "ALL" ? undefined : status,
    warehouseId,
  });

  return (
    <>
      <PageHeader
        title="Stock Opname"
        description="Hitung fisik stok per gudang; selisih dibukukan sebagai penyesuaian saat diposting"
      />
      <DataTable
        columns={columns}
        result={query.data}
        isLoading={query.isLoading}
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <WarehouseFilter
              value={warehouseId}
              onChange={(v) => {
                setWarehouseId(v);
                setPage(1);
              }}
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as StatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue>
                  {(v: StatusFilter) => (v === "ALL" ? "Semua status" : OPNAME_STATUS_LABEL[v])}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua status</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {OPNAME_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setCreating(true)}>
              <Plus /> Buat opname
            </Button>
          </div>
        }
      />
      <OpnameCreateDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
