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
import { PURCHASE_ORDERS_KEY } from "@/features/purchase-orders/api";
import { formatDate, formatIDR } from "@/features/purchase-orders/format";
import { PurchaseOrderStatusBadge } from "@/features/purchase-orders/status-badge";
import {
  PO_STATUS_LABEL,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from "@/features/purchase-orders/types";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";
import { useAuthStore } from "@/lib/auth-store";
import { canAccess } from "@/lib/navigation";

const STATUSES = Object.keys(PO_STATUS_LABEL) as PurchaseOrderStatus[];
type StatusFilter = PurchaseOrderStatus | "ALL";

export default function PurchaseOrdersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const debouncedSearch = useDebounce(search);
  const role = useAuthStore((s) => s.user?.role);
  const canCreate = canAccess(role, ["PURCHASING"]);

  const query = useListQuery<PurchaseOrder>(PURCHASE_ORDERS_KEY, {
    page,
    limit: 10,
    search: debouncedSearch,
    status: status === "ALL" ? undefined : status,
  });

  const columns: DataTableColumns<PurchaseOrder> = [
    {
      accessorKey: "number",
      header: "No. PO",
      cell: ({ row }) => (
        <Link className="font-medium hover:underline" href={`/purchase-orders/${row.original.id}`}>
          {row.original.number}
        </Link>
      ),
    },
    {
      accessorKey: "orderDate",
      header: "Tanggal",
      cell: ({ row }) => formatDate(row.original.orderDate),
    },
    { id: "supplier", header: "Supplier", cell: ({ row }) => row.original.supplier.name },
    { id: "warehouse", header: "Gudang", cell: ({ row }) => row.original.warehouse.name },
    {
      accessorKey: "totalAmount",
      header: "Total",
      cell: ({ row }) => formatIDR(row.original.totalAmount),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <PurchaseOrderStatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Lihat detail"
          render={<Link href={`/purchase-orders/${row.original.id}`} />}
        >
          <Eye />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Purchase Order"
        description="Pembelian barang ke supplier: draft → disetujui → diterima"
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
          <div className="flex gap-2">
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as StatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue>
                  {(v: StatusFilter) => (v === "ALL" ? "Semua status" : PO_STATUS_LABEL[v])}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua status</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PO_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canCreate && (
              <Button render={<Link href="/purchase-orders/new" />}>
                <Plus /> Buat PO
              </Button>
            )}
          </div>
        }
      />
    </>
  );
}
