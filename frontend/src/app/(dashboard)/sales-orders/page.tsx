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
import { SALES_ORDERS_KEY } from "@/features/sales-orders/api";
import { formatDate, formatIDR } from "@/features/sales-orders/format";
import { SalesOrderStatusBadge } from "@/features/sales-orders/status-badge";
import {
  SO_STATUS_LABEL,
  type SalesOrder,
  type SalesOrderStatus,
} from "@/features/sales-orders/types";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";
import { useAuthStore } from "@/lib/auth-store";
import { canAccess } from "@/lib/navigation";

const STATUSES = Object.keys(SO_STATUS_LABEL) as SalesOrderStatus[];
type StatusFilter = SalesOrderStatus | "ALL";

export default function SalesOrdersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const debouncedSearch = useDebounce(search);
  const role = useAuthStore((s) => s.user?.role);
  const canCreate = canAccess(role, ["SALES"]);

  const query = useListQuery<SalesOrder>(SALES_ORDERS_KEY, {
    page,
    limit: 10,
    search: debouncedSearch,
    status: status === "ALL" ? undefined : status,
  });

  const columns: DataTableColumns<SalesOrder> = [
    {
      accessorKey: "number",
      header: "No. SO",
      cell: ({ row }) => (
        <Link className="font-medium hover:underline" href={`/sales-orders/${row.original.id}`}>
          {row.original.number}
        </Link>
      ),
    },
    {
      accessorKey: "orderDate",
      header: "Tanggal",
      cell: ({ row }) => formatDate(row.original.orderDate),
    },
    { id: "customer", header: "Customer", cell: ({ row }) => row.original.customer.name },
    { id: "warehouse", header: "Gudang", cell: ({ row }) => row.original.warehouse.name },
    {
      accessorKey: "totalAmount",
      header: "Total",
      cell: ({ row }) => formatIDR(row.original.totalAmount),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <SalesOrderStatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Lihat detail"
          render={<Link href={`/sales-orders/${row.original.id}`} />}
        >
          <Eye />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Sales Order"
        description="Penjualan ke customer: draft → dikonfirmasi → dikirim"
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
                  {(v: StatusFilter) => (v === "ALL" ? "Semua status" : SO_STATUS_LABEL[v])}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua status</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SO_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canCreate && (
              <Button render={<Link href="/sales-orders/new" />}>
                <Plus /> Buat SO
              </Button>
            )}
          </div>
        }
      />
    </>
  );
}
