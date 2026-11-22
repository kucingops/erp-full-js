"use client";

import { tableFeatures, useTable, type ColumnDef, type RowData } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Paginated } from "@/lib/types";

/** Fitur TanStack Table v9 yang dipakai. Pagination/sort/search dikerjakan di server. */
export const dataTableFeatures = tableFeatures({});
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- kolom punya tipe value berbeda-beda
export type DataTableColumns<T extends RowData> = ColumnDef<typeof dataTableFeatures, T, any>[];

const EMPTY: never[] = [];

interface DataTableProps<T extends RowData> {
  columns: DataTableColumns<T>;
  result?: Paginated<T>;
  isLoading?: boolean;
  search?: string;
  onSearchChange?: (value: string) => void;
  onPageChange: (page: number) => void;
  toolbar?: React.ReactNode;
}

/**
 * Tabel standar untuk semua halaman list (server-side pagination).
 * Pasangkan dengan useListQuery(). Contoh lengkap: app/(dashboard)/users/page.tsx
 */
export function DataTable<T extends RowData>({
  columns,
  result,
  isLoading,
  search,
  onSearchChange,
  onPageChange,
  toolbar,
}: DataTableProps<T>) {
  const table = useTable<typeof dataTableFeatures, T>({
    features: dataTableFeatures,
    columns,
    data: result?.data ?? (EMPTY as T[]),
  });
  const meta = result?.meta;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onSearchChange ? (
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Cari..."
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        ) : (
          <div />
        )}
        {toolbar}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading && !result ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={columns.length}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  Belum ada data
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Total {meta.total} data · halaman {meta.page} dari {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
            >
              <ChevronLeft /> Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(meta.page + 1)}
            >
              Berikutnya <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
