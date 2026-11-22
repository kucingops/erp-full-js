"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDashboardTrend } from "./api";
import { formatIDR, formatIDRCompact, formatMonth } from "./format";

/**
 * Warna tetap per entitas (penjualan selalu biru, pembelian selalu oranye),
 * jadi kalau role cuma lihat satu seri warnanya tidak bergeser.
 * Pasangan biru/oranye dipilih karena tetap beda untuk buta warna merah-hijau.
 */
const config = {
  sales: { label: "Penjualan", theme: { light: "#2a78d6", dark: "#3987e5" } },
  purchases: { label: "Pembelian", theme: { light: "#eb6834", dark: "#d95926" } },
} satisfies ChartConfig;

const RANGES = [3, 6, 12] as const;

export function TrendChart() {
  const [months, setMonths] = useState<(typeof RANGES)[number]>(6);
  const [asTable, setAsTable] = useState(false);
  const { data, isLoading } = useDashboardTrend(months);

  const rows = (data ?? []).map((p) => ({
    month: p.month,
    sales: p.sales === undefined ? undefined : Number(p.sales),
    purchases: p.purchases === undefined ? undefined : Number(p.purchases),
  }));
  // Seri yang muncul tergantung role (backend menghilangkan field yang tidak boleh dilihat).
  const series = (["sales", "purchases"] as const).filter((k) => data?.[0]?.[k] !== undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tren {series.map((s) => config[s].label.toLowerCase()).join(" & ")}</CardTitle>
        <CardDescription>Total per bulan (dokumen yang sudah dikonfirmasi/di-approve)</CardDescription>
        <CardAction className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r}
              size="xs"
              variant={r === months ? "secondary" : "ghost"}
              onClick={() => setMonths(r)}
              aria-pressed={r === months}
            >
              {r} bln
            </Button>
          ))}
          <Button size="xs" variant="outline" onClick={() => setAsTable((v) => !v)}>
            {asTable ? "Chart" : "Tabel"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : asTable ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bulan</TableHead>
                {series.map((s) => (
                  <TableHead key={s} className="text-right">
                    {config[s].label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.month}>
                  <TableCell>{formatMonth(r.month)}</TableCell>
                  {series.map((s) => (
                    <TableCell key={s} className="text-right tabular-nums">
                      {formatIDR(r[s] ?? 0)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-72 w-full">
            <BarChart data={rows} barGap={2} accessibilityLayer>
              <CartesianGrid vertical={false} strokeOpacity={0.5} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={formatMonth} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={80}
                tickFormatter={(v: number) => formatIDRCompact(v)}
              />
              <ChartTooltip
                cursor={{ fillOpacity: 0.4 }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => formatMonth(String(payload?.[0]?.payload?.month ?? ""))}
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span
                            className="size-2.5 rounded-[2px]"
                            style={{ background: `var(--color-${name})` }}
                          />
                          {config[name as keyof typeof config]?.label}
                        </span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {formatIDR(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
              {series.map((s) => (
                <Bar key={s} dataKey={s} fill={`var(--color-${s})`} radius={[4, 4, 0, 0]} maxBarSize={40} />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
