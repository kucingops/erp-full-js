"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatJournalDate, SourceBadge, sourceHref } from "./accounting-ui";
import { useJournal, useReverseJournal } from "./api";

export function JournalDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: e, isLoading } = useJournal(id);
  const reverse = useReverseJournal();
  const href = e ? sourceHref(e.sourceType, e.sourceId) : null;
  const canReverse = e?.sourceType === "MANUAL" && !e.reversalOf && !e.reversedBy;

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{e ? `Jurnal ${e.number}` : "Jurnal"}</DialogTitle>
        </DialogHeader>
        {isLoading || !e ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span>{formatJournalDate(e.date)}</span>
              <SourceBadge type={e.sourceType} />
              {e.sourceNumber &&
                (href ? (
                  <Link href={href} className="text-primary underline-offset-4 hover:underline">
                    {e.sourceNumber}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{e.sourceNumber}</span>
                ))}
              {e.reversalOf && <span className="text-muted-foreground">Pembalik dari {e.reversalOf.number}</span>}
              {e.reversedBy && <span className="text-destructive">Sudah dibalik oleh {e.reversedBy.number}</span>}
            </div>
            <p className="text-sm">{e.description}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Akun</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Kredit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className={Number(l.credit) > 0 ? "pl-8" : undefined}>
                      {l.account.code} {l.account.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(l.debit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(l.credit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(e.totalAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(e.totalAmount)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
        {canReverse && (
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={reverse.isPending}
              onClick={() => {
                if (confirm("Buat jurnal pembalik untuk jurnal ini?")) reverse.mutate(e.id, { onSuccess: onClose });
              }}
            >
              Batalkan (jurnal pembalik)
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
