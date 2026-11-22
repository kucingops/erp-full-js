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
import { formatDate, formatIDR } from "@/features/sales-orders/format";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";
import { useAuthStore } from "@/lib/auth-store";
import { canAccess } from "@/lib/navigation";
import type { InvoiceConfig } from "./config";
import { CreateInvoiceDialog } from "./create-invoice-dialog";
import { OutstandingSummary } from "./outstanding-summary";
import { InvoiceStatusBadge } from "./status-badge";
import { INVOICE_STATUS_LABEL, type Invoice, type InvoiceStatus } from "./types";

type Filter = "ALL" | "OUTSTANDING" | "OVERDUE" | InvoiceStatus;

const FILTER_LABEL: Record<Filter, string> = {
  ALL: "Semua",
  OUTSTANDING: "Belum lunas",
  OVERDUE: "Lewat jatuh tempo",
  ...INVOICE_STATUS_LABEL,
};

/** Filter UI → query backend. */
function toQuery(f: Filter) {
  if (f === "OUTSTANDING") return { outstanding: true };
  if (f === "OVERDUE") return { overdue: true };
  if (f === "ALL") return {};
  return { status: f };
}

/** Halaman list invoice/tagihan. Dipakai /sales-invoices dan /purchase-bills dengan `cfg` berbeda. */
export function InvoiceListPage({ cfg }: { cfg: InvoiceConfig }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("OUTSTANDING");
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebounce(search);
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = canAccess(role, cfg.roles);

  const query = useListQuery<Invoice>(cfg.resource, {
    page,
    limit: 10,
    search: debouncedSearch,
    sortBy: "dueDate",
    sortOrder: "asc",
    ...toQuery(filter),
  });

  const href = (id: string) => `/${cfg.resource}/${id}`;
  const columns: DataTableColumns<Invoice> = [
    {
      accessorKey: "number",
      header: `No. ${cfg.docLabel.toLowerCase()}`,
      cell: ({ row }) => (
        <Link className="font-medium hover:underline" href={href(row.original.id)}>
          {row.original.number}
        </Link>
      ),
    },
    { id: "partner", header: cfg.partnerLabel, cell: ({ row }) => cfg.partnerOf(row.original)?.name },
    { id: "order", header: cfg.orderLabel, cell: ({ row }) => cfg.orderOf(row.original)?.number },
    { accessorKey: "dueDate", header: "Jatuh tempo", cell: ({ row }) => formatDate(row.original.dueDate) },
    {
      accessorKey: "totalAmount",
      header: "Total",
      cell: ({ row }) => formatIDR(row.original.totalAmount),
    },
    {
      id: "outstanding",
      header: "Sisa",
      cell: ({ row }) => <span className="font-medium">{formatIDR(row.original.outstandingAmount)}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <InvoiceStatusBadge status={row.original.status} isOverdue={row.original.isOverdue} />
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Lihat detail"
          render={<Link href={href(row.original.id)} />}
        >
          <Eye />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={cfg.title} description={cfg.description} />
      <OutstandingSummary cfg={cfg} />
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
              value={filter}
              onValueChange={(v) => {
                setFilter(v as Filter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue>{(v: Filter) => FILTER_LABEL[v]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FILTER_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canWrite && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Buat {cfg.docLabel.toLowerCase()}
              </Button>
            )}
          </div>
        }
      />
      <CreateInvoiceDialog cfg={cfg} open={creating} onOpenChange={setCreating} />
    </>
  );
}
