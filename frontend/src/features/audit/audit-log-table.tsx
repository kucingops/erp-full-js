"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { AuditDiff } from "./audit-diff";
import {
  ACTION_LABEL,
  entityLabel,
  operationLabel,
  type AuditAction,
  type AuditLog,
} from "./types";

const dateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Jakarta",
});

const ACTION_VARIANT: Record<AuditAction, "default" | "secondary" | "destructive" | "outline"> = {
  CREATE: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
  STATUS: "outline",
};

/** Label singkat baris: nomor dokumen / kode / nama kalau ada di snapshot. */
function describe(log: AuditLog) {
  const snap = log.after ?? log.before ?? {};
  const pick = ["number", "code", "sku", "name", "email"]
    .map((k) => snap[k])
    .find((v) => typeof v === "string");
  return (pick as string | undefined) ?? log.entityId?.slice(0, 8) ?? "-";
}

/**
 * Tabel audit log dengan baris yang bisa di-expand untuk lihat before/after.
 * Tidak pakai DataTable karena butuh baris detail di bawah tiap baris.
 */
export function AuditLogTable({
  result,
  isLoading,
  onPageChange,
}: {
  result?: Paginated<AuditLog>;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const meta = result?.meta;
  const COLS = 6;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Waktu</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !result ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={COLS}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !result || result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLS} className="h-24 text-center text-muted-foreground">
                  Belum ada aktivitas
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((log) => {
                const open = expanded.has(log.id);
                return (
                  <Fragment key={log.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggle(log.id)}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={open ? "Tutup detail" : "Lihat detail"}
                          aria-expanded={open}
                        >
                          <ChevronDown className={cn("transition-transform", !open && "-rotate-90")} />
                        </Button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {dateTime.format(new Date(log.createdAt))}
                      </TableCell>
                      <TableCell>
                        {log.user ? (
                          <span title={log.user.email}>{log.user.name}</span>
                        ) : (
                          <span className="text-muted-foreground">Sistem</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ACTION_VARIANT[log.action]}>
                          {log.operation ? operationLabel(log.operation) : ACTION_LABEL[log.action]}
                        </Badge>
                      </TableCell>
                      <TableCell>{entityLabel(log.entity)}</TableCell>
                      <TableCell className="font-mono text-xs">{describe(log)}</TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={COLS} className="whitespace-normal">
                          <div className="space-y-2 py-1">
                            <p className="text-xs text-muted-foreground">
                              ID data: <span className="font-mono">{log.entityId ?? "-"}</span>
                              {log.ip && (
                                <>
                                  {" · "}IP: <span className="font-mono">{log.ip}</span>
                                </>
                              )}
                              {log.user && <> · {log.user.email}</>}
                            </p>
                            <AuditDiff before={log.before} after={log.after} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
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
