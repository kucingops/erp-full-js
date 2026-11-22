"use client";

import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumns } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { AccountingTabs, formatAmount, formatJournalDate, SourceBadge } from "@/features/accounting/accounting-ui";
import { JOURNALS_RESOURCE, useSyncJournals } from "@/features/accounting/api";
import { JournalDetailDialog } from "@/features/accounting/journal-detail-dialog";
import { JournalFormDialog } from "@/features/accounting/journal-form-dialog";
import { SOURCE_LABEL, type JournalEntry, type JournalSourceType } from "@/features/accounting/types";
import { DateRange, FilterSelect } from "@/features/reports/report-ui";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";

export default function JournalsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [detail, setDetail] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounce(search);
  const sync = useSyncJournals();

  const query = useListQuery<JournalEntry>(JOURNALS_RESOURCE, {
    page,
    limit: 20,
    search: debounced,
    sourceType: sourceType || undefined,
    from: range.from || undefined,
    to: range.to || undefined,
  });

  const columns: DataTableColumns<JournalEntry> = [
    { accessorKey: "date", header: "Tanggal", cell: ({ row }) => formatJournalDate(row.original.date) },
    {
      accessorKey: "number",
      header: "No. Jurnal",
      cell: ({ row }) => (
        <button className="font-medium text-primary hover:underline" onClick={() => setDetail(row.original.id)}>
          {row.original.number}
        </button>
      ),
    },
    { accessorKey: "sourceType", header: "Sumber", cell: ({ row }) => <SourceBadge type={row.original.sourceType} /> },
    {
      accessorKey: "description",
      header: "Keterangan",
      cell: ({ row }) => (
        <div className="max-w-md">
          <div className="truncate">{row.original.description}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.lines.map((l) => `${l.account.code}${Number(l.debit) > 0 ? " D" : " K"}`).join(" · ")}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "totalAmount",
      header: () => <div className="text-right">Nilai (IDR)</div>,
      cell: ({ row }) => <div className="text-right tabular-nums">{formatAmount(row.original.totalAmount)}</div>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Akuntansi"
        description="Jurnal otomatis dari invoice, pembayaran, dan mutasi stok, plus jurnal umum manual."
        actions={
          <>
            <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
              <RefreshCw className={sync.isPending ? "animate-spin" : undefined} /> Sinkronkan
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus /> Jurnal umum
            </Button>
          </>
        }
      />
      <AccountingTabs />
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
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              ariaLabel="Sumber jurnal"
              value={sourceType}
              onChange={(v) => {
                setSourceType(v);
                setPage(1);
              }}
              allLabel="Semua sumber"
              options={(Object.keys(SOURCE_LABEL) as JournalSourceType[]).map((s) => ({
                value: s,
                label: SOURCE_LABEL[s],
              }))}
            />
            <DateRange
              from={range.from}
              to={range.to}
              onChange={(r) => {
                setRange(r);
                setPage(1);
              }}
            />
          </div>
        }
      />
      <JournalDetailDialog id={detail} onClose={() => setDetail(null)} />
      <JournalFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
