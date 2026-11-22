"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountingTabs, formatAmount } from "@/features/accounting/accounting-ui";
import { useTrialBalance } from "@/features/accounting/api";
import { ACCOUNT_TYPE_LABEL } from "@/features/accounting/types";
import { DateRange, defaultRange } from "@/features/reports/report-ui";

/**
 * Neraca saldo: saldo awal, mutasi debit/kredit periode, saldo akhir per akun.
 * Kolom saldo akhir D/K harus sama totalnya: itu cek bahwa semua jurnal seimbang.
 */
export default function TrialBalancePage() {
  const [range, setRange] = useState(defaultRange);
  const tb = useTrialBalance(range.from, range.to);
  const d = tb.data;

  return (
    <>
      <PageHeader title="Akuntansi" description="Neraca saldo (trial balance) dalam IDR." />
      <AccountingTabs />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <DateRange from={range.from} to={range.to} onChange={setRange} />
        {d &&
          (d.balanced ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-600" /> Debit = kredit, seimbang
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4" /> Tidak seimbang, cek jurnal
            </span>
          ))}
      </div>
      {tb.isLoading || !d ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className="w-24">Kode</TableHead>
                <TableHead rowSpan={2}>Akun</TableHead>
                <TableHead rowSpan={2} className="text-right">Saldo awal</TableHead>
                <TableHead colSpan={2} className="text-center">Mutasi</TableHead>
                <TableHead colSpan={2} className="text-center">Saldo akhir</TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Kredit</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Kredit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Belum ada jurnal.
                  </TableCell>
                </TableRow>
              )}
              {d.rows.map((r) => (
                <TableRow key={r.accountId}>
                  <TableCell className="tabular-nums">{r.code}</TableCell>
                  <TableCell>
                    <Link
                      className="hover:underline"
                      href={`/accounting/ledger?accountId=${r.accountId}&from=${range.from}&to=${range.to}`}
                    >
                      {r.name}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[r.type]}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.openingBalance)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.debit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.credit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.closingDebit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.closingCredit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(d.total.debit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(d.total.credit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(d.total.closingDebit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(d.total.closingCredit)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </>
  );
}
