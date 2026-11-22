"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountingTabs, formatAmount, formatJournalDate, SourceBadge } from "@/features/accounting/accounting-ui";
import { useAccounts, useGeneralLedger } from "@/features/accounting/api";
import { JournalDetailDialog } from "@/features/accounting/journal-detail-dialog";
import { DateRange, defaultRange, FilterSelect } from "@/features/reports/report-ui";

function LedgerView() {
  const params = useSearchParams();
  const [accountId, setAccountId] = useState(params.get("accountId") ?? "");
  const [range, setRange] = useState(() => ({
    ...defaultRange(),
    ...(params.get("from") && { from: params.get("from")! }),
    ...(params.get("to") && { to: params.get("to")! }),
  }));
  const [detail, setDetail] = useState<string | null>(null);
  const accounts = useAccounts({ postable: true });
  const gl = useGeneralLedger(accountId, range.from, range.to);
  const d = gl.data;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterSelect
          className="w-72"
          ariaLabel="Akun"
          value={accountId}
          onChange={setAccountId}
          options={(accounts.data ?? []).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
        />
        <DateRange from={range.from} to={range.to} onChange={setRange} />
      </div>

      {!accountId ? (
        <p className="text-sm text-muted-foreground">Pilih akun untuk melihat buku besarnya.</p>
      ) : gl.isLoading || !d ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Tanggal</TableHead>
                <TableHead className="w-44">No. Jurnal</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Kredit</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/40">
                <TableCell colSpan={5} className="font-medium">
                  Saldo awal
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatAmount(d.openingBalance)}</TableCell>
              </TableRow>
              {d.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Tidak ada transaksi di periode ini.
                  </TableCell>
                </TableRow>
              )}
              {d.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatJournalDate(r.date)}</TableCell>
                  <TableCell>
                    <button className="text-primary hover:underline" onClick={() => setDetail(r.entryId)}>
                      {r.number}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <SourceBadge type={r.sourceType} />
                      <span className="truncate">{r.description}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.debit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.credit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total mutasi & saldo akhir</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(d.totalDebit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(d.totalCredit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(d.closingBalance)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className="p-3 text-xs text-muted-foreground">
            Saldo mengikuti saldo normal akun (aset & beban: debit - kredit; kewajiban, ekuitas, pendapatan: kredit - debit).
            Angka dalam kurung = saldo berlawanan.
          </p>
        </div>
      )}
      <JournalDetailDialog id={detail} onClose={() => setDetail(null)} />
    </>
  );
}

export default function LedgerPage() {
  return (
    <>
      <PageHeader title="Akuntansi" description="Buku besar per akun, dengan saldo berjalan (IDR)." />
      <AccountingTabs />
      {/* useSearchParams butuh Suspense boundary di Next.js */}
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <LedgerView />
      </Suspense>
    </>
  );
}
