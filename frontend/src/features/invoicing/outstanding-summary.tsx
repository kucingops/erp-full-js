"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIDR } from "@/features/sales-orders/format";
import { useInvoiceSummary } from "./api";
import type { InvoiceConfig } from "./config";
import type { InvoiceSummary } from "./types";

const AGING: { key: keyof InvoiceSummary["aging"]; label: string }[] = [
  { key: "current", label: "Belum jatuh tempo" },
  { key: "d1_30", label: "1–30 hari" },
  { key: "d31_60", label: "31–60 hari" },
  { key: "d61_90", label: "61–90 hari" },
  { key: "d90plus", label: "> 90 hari" },
];

/** Kartu ringkasan outstanding (AR/AP): total sisa, lewat jatuh tempo, aging, partner terbesar. */
export function OutstandingSummary({ cfg }: { cfg: InvoiceConfig }) {
  const { data, isLoading } = useInvoiceSummary(cfg);
  if (isLoading || !data) return <Skeleton className="mb-6 h-32 w-full" />;

  const total = Number(data.totalOutstanding);
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total belum dibayar
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          <span className="text-2xl font-semibold tabular-nums">{formatIDR(total)}</span>
          <span className="text-sm text-muted-foreground">{data.openCount} dokumen terbuka</span>
          <span className="text-sm text-destructive">
            {formatIDR(data.overdueAmount)} lewat jatuh tempo ({data.overdueCount})
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Umur tagihan</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {AGING.map(({ key, label }) => {
            const v = Number(data.aging[key]);
            return (
              <div key={key} className="grid gap-1">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="tabular-nums">{formatIDR(v)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className={key === "current" ? "h-1.5 rounded-full bg-primary" : "h-1.5 rounded-full bg-destructive"}
                    style={{ width: `${total > 0 ? (v / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {cfg.partnerLabel} dengan sisa terbesar
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {data.topPartners.length === 0 && <span className="text-muted-foreground">Semua lunas 🎉</span>}
          {data.topPartners.map((p) => (
            <div key={p.id} className="flex justify-between gap-2">
              <span className="truncate">
                {p.name} <span className="text-muted-foreground">({p.count})</span>
              </span>
              <span className="tabular-nums">{formatIDR(p.outstanding)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
