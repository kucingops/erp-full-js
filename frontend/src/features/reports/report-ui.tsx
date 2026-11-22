"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthStore } from "@/lib/auth-store";
import { formatMoney } from "@/features/currencies/format";
import { formatIDR, formatNumber } from "@/features/dashboard/format";
import type { Option } from "./api";
import { canSeeReport, type ReportDef } from "./reports";
import type { ExportFormat } from "./types";

const ALL = "all";

/** Dropdown filter generik. `value` kosong = semua. */
export function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  className = "w-48",
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  /** kalau diisi, ada pilihan "semua"; kalau tidak, wajib pilih salah satu */
  allLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const current = value || (allLabel ? ALL : "");
  return (
    <Select value={current} onValueChange={(v) => onChange(!v || v === ALL ? "" : String(v))}>
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue>
          {(v: string) =>
            v === ALL ? allLabel : (options.find((o) => o.value === v)?.label ?? "Pilih")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (v: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        className="w-40"
        aria-label="Dari tanggal"
        value={from}
        max={to}
        onChange={(e) => onChange({ from: e.target.value, to })}
      />
      <span className="text-sm text-muted-foreground">s/d</span>
      <Input
        type="date"
        className="w-40"
        aria-label="Sampai tanggal"
        value={to}
        min={from}
        onChange={(e) => onChange({ from, to: e.target.value })}
      />
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Default filter tanggal: awal bulan ini s/d hari ini (waktu lokal browser). */
export function defaultRange() {
  const now = new Date();
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
}

export function ExportButtons({
  onExport,
  pending,
}: {
  onExport: (format: ExportFormat) => void;
  pending: boolean;
}) {
  return (
    <>
      <Button variant="outline" disabled={pending} onClick={() => onExport("csv")}>
        <FileText /> CSV
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => onExport("xlsx")}>
        <FileSpreadsheet /> Excel
      </Button>
    </>
  );
}

export type ColumnKind = "text" | "int" | "money";

export interface ReportColumn<T> {
  key: string;
  header: string;
  kind: ColumnKind;
  /** Mata uang kolom "money" (default IDR) */
  currency?: string;
  value: (row: T) => string | number | null;
}

function formatCell(v: string | number | null | undefined, kind: ColumnKind, currency?: string) {
  if (v === null || v === undefined || v === "") return "-";
  if (kind === "money") return currency ? formatMoney(v, currency) : formatIDR(v);
  if (kind === "int") return formatNumber(Number(v));
  return v;
}

/**
 * Tabel laporan generik + baris total. Laporan tidak dipaginasi (sudah teragregasi),
 * jadi cukup tabel biasa, bukan DataTable server-side.
 */
export function ReportTable<T>({
  columns,
  rows,
  totals,
  rowKey,
  isLoading,
  error,
}: {
  columns: ReportColumn<T>[];
  rows: T[] | undefined;
  totals?: Record<string, string | number | null>;
  rowKey: (row: T) => string;
  isLoading: boolean;
  error?: Error | null;
}) {
  const align = (kind: ColumnKind) => (kind === "text" ? "" : "text-right tabular-nums");
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={align(c.kind)}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && !rows ? (
            Array.from({ length: 4 }, (_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={columns.length}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : error ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-8 text-center text-destructive">
                {error.message}
              </TableCell>
            </TableRow>
          ) : !rows?.length ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                Tidak ada data untuk filter ini.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={align(c.kind)}>
                    {formatCell(c.value(row), c.kind, c.currency)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
        {totals && !!rows?.length && (
          <TableFooter>
            <TableRow className="font-semibold">
              {columns.map((c, i) => (
                <TableCell key={c.key} className={align(c.kind)}>
                  {i === 0 ? "Total" : c.key in totals ? formatCell(totals[c.key], c.kind, c.currency) : ""}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

/** Tolak halaman laporan kalau role user tidak termasuk (AuthGuard cuma cek menu "Laporan"). */
export function ReportGate({ report, children }: { report: ReportDef; children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (!canSeeReport(role, report)) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold">403: Akses ditolak</h1>
        <p className="text-sm text-muted-foreground">Role kamu tidak punya akses ke laporan ini.</p>
      </div>
    );
  }
  return <>{children}</>;
}
