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
import { STOCK_TRANSFERS_KEY } from "@/features/stock-ops/api";
import { formatDate, TransferStatusBadge } from "@/features/stock-ops/components";
import {
  TRANSFER_STATUS_LABEL,
  type StockTransfer,
  type StockTransferStatus,
} from "@/features/stock-ops/types";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";

const STATUSES = Object.keys(TRANSFER_STATUS_LABEL) as StockTransferStatus[];
type StatusFilter = StockTransferStatus | "ALL";

const columns: DataTableColumns<StockTransfer> = [
  {
    accessorKey: "number",
    header: "No. Transfer",
    cell: ({ row }) => (
      <Link className="font-medium hover:underline" href={`/stock-transfers/${row.original.id}`}>
        {row.original.number}
      </Link>
    ),
  },
  {
    accessorKey: "transferDate",
    header: "Tanggal",
    cell: ({ row }) => formatDate(row.original.transferDate),
  },
  { id: "from", header: "Dari", cell: ({ row }) => row.original.fromWarehouse.name },
  { id: "to", header: "Ke", cell: ({ row }) => row.original.toWarehouse.name },
  { id: "items", header: "Item", cell: ({ row }) => row.original._count?.items ?? "-" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <TransferStatusBadge status={row.original.status} />,
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Lihat detail"
        render={<Link href={`/stock-transfers/${row.original.id}`} />}
      >
        <Eye />
      </Button>
    ),
  },
];

export default function StockTransfersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [warehouseId, setWarehouseId] = useState("");
  const debouncedSearch = useDebounce(search);

  const query = useListQuery<StockTransfer>(STOCK_TRANSFERS_KEY, {
    page,
    limit: 10,
    search: debouncedSearch,
    status: status === "ALL" ? undefined : status,
    warehouseId,
  });

  return (
    <>
      <PageHeader
        title="Transfer Stok"
        description="Pindah barang antar gudang: draft → dikirim (stok asal keluar) → diterima (stok tujuan masuk)"
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
                  {(v: StatusFilter) => (v === "ALL" ? "Semua status" : TRANSFER_STATUS_LABEL[v])}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua status</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TRANSFER_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button render={<Link href="/stock-transfers/new" />}>
              <Plus /> Buat transfer
            </Button>
          </div>
        }
      />
    </>
  );
}
