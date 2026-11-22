"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumns } from "@/components/data-table/data-table";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CURRENCIES_KEY,
  EXCHANGE_RATES_KEY,
  useDeleteCurrency,
  useDeleteRate,
  useSaveCurrency,
} from "@/features/currencies/api";
import { CurrencySelect } from "@/features/currencies/components";
import { CurrencyFormDialog, RateFormDialog } from "@/features/currencies/dialogs";
import { formatMoney } from "@/features/currencies/format";
import { BASE_CURRENCY, type Currency, type ExchangeRate } from "@/features/currencies/types";
import { formatDate } from "@/features/purchase-orders/format";
import { ActiveFilterSelect, RowActions, StatusCell } from "@/features/master-data/components";
import { useCanWrite, useMasterList } from "@/features/master-data/use-master-list";
import { useListQuery } from "@/hooks/use-list-query";

/**
 * Master mata uang + histori kurs harian. Baca: semua role. Tulis: ADMIN.
 * Kurs = nilai 1 unit mata uang dalam IDR (base). PO/SO menyimpan snapshot kurs sendiri,
 * jadi mengubah/menghapus kurs di sini tidak mengubah dokumen lama.
 */
export default function CurrenciesPage() {
  const canWrite = useCanWrite(["ADMIN"]);
  const list = useMasterList<Currency>(CURRENCIES_KEY, { sortBy: "code", sortOrder: "asc" });
  const save = useSaveCurrency();
  const remove = useDeleteCurrency();
  const [editing, setEditing] = useState<Currency | null>(null);
  const [open, setOpen] = useState(false);

  const [rateCurrency, setRateCurrency] = useState<string | null>(null);
  const [ratePage, setRatePage] = useState(1);
  const [rateOpen, setRateOpen] = useState(false);
  const rates = useListQuery<ExchangeRate>(EXCHANGE_RATES_KEY, {
    page: ratePage,
    limit: 10,
    currencyCode: rateCurrency ?? undefined,
    sortBy: "effectiveDate",
    sortOrder: "desc",
  });
  const removeRate = useDeleteRate();

  const sortable = (text: string, field: string) =>
    function SortHeader() {
      return <SortableHeader label={text} field={field} sort={list.sort} onSort={list.toggleSort} />;
    };

  const columns: DataTableColumns<Currency> = [
    {
      accessorKey: "code",
      header: sortable("Kode", "code"),
      cell: ({ row }) => (
        <span className="flex items-center gap-2 font-mono">
          {row.original.code}
          {row.original.isBase && <Badge variant="secondary">Base</Badge>}
        </span>
      ),
    },
    { accessorKey: "name", header: sortable("Nama", "name") },
    { accessorKey: "symbol", header: "Simbol", cell: ({ row }) => row.original.symbol || "-" },
    {
      id: "latestRate",
      header: "Kurs terakhir",
      cell: ({ row }) => {
        const r = row.original.latestRate;
        if (!r) return <span className="text-muted-foreground">Belum ada</span>;
        return (
          <span>
            {formatMoney(r.rate)}
            {r.effectiveDate && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({formatDate(r.effectiveDate)})
              </span>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <StatusCell
          active={row.original.isActive}
          onToggle={
            canWrite && !row.original.isBase
              ? () => save.mutate({ id: row.original.id, isActive: !row.original.isActive })
              : undefined
          }
        />
      ),
    },
    ...(canWrite
      ? ([
          {
            id: "actions",
            header: "",
            cell: ({ row }) =>
              row.original.isBase ? null : (
                <RowActions
                  name={row.original.name}
                  deleting={remove.isPending}
                  onEdit={() => {
                    setEditing(row.original);
                    setOpen(true);
                  }}
                  onDelete={() => remove.mutateAsync(row.original.id)}
                />
              ),
          },
        ] satisfies DataTableColumns<Currency>)
      : []),
  ];

  const rateColumns: DataTableColumns<ExchangeRate> = [
    { accessorKey: "effectiveDate", header: "Berlaku mulai", cell: ({ row }) => formatDate(row.original.effectiveDate) },
    {
      accessorKey: "currencyCode",
      header: "Mata uang",
      cell: ({ row }) => `${row.original.currencyCode} · ${row.original.currency.name}`,
    },
    {
      accessorKey: "rate",
      header: `1 unit = ${BASE_CURRENCY}`,
      cell: ({ row }) => formatMoney(row.original.rate),
    },
    ...(canWrite
      ? ([
          {
            id: "actions",
            header: "",
            cell: ({ row }) => (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Hapus kurs"
                  disabled={removeRate.isPending}
                  onClick={() => removeRate.mutate(row.original.id)}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            ),
          },
        ] satisfies DataTableColumns<ExchangeRate>)
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Mata Uang & Kurs"
        description={`Base currency ${BASE_CURRENCY}. Kurs dipakai otomatis saat membuat PO/SO.`}
      />
      <div className="grid gap-6">
        <DataTable
          columns={columns}
          result={list.query.data}
          isLoading={list.query.isLoading}
          search={list.search}
          onSearchChange={list.setSearch}
          onPageChange={list.setPage}
          toolbar={
            <div className="flex gap-2">
              <ActiveFilterSelect value={list.active} onChange={list.setActive} />
              {canWrite && (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                >
                  <Plus /> Tambah mata uang
                </Button>
              )}
            </div>
          }
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Histori kurs</CardTitle>
            <div className="flex gap-2">
              <div className="w-56">
                <CurrencySelect
                  allowEmpty
                  emptyLabel="Semua mata uang"
                  value={rateCurrency}
                  onChange={(c) => {
                    setRateCurrency(c);
                    setRatePage(1);
                  }}
                />
              </div>
              {canWrite && (
                <Button onClick={() => setRateOpen(true)}>
                  <Plus /> Input kurs
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={rateColumns}
              result={rates.data}
              isLoading={rates.isLoading}
              onPageChange={setRatePage}
            />
          </CardContent>
        </Card>
      </div>
      <CurrencyFormDialog open={open} onOpenChange={setOpen} currency={editing} />
      <RateFormDialog
        open={rateOpen}
        onOpenChange={setRateOpen}
        defaultCurrency={rateCurrency ?? undefined}
      />
    </>
  );
}
