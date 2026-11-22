import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { percentChange } from "./format";

/**
 * Kartu angka utama (stat tile). Perubahan vs bulan lalu ditulis dengan ikon + teks,
 * bukan warna saja, supaya tetap terbaca untuk buta warna.
 */
export function KpiCard({
  title,
  value,
  icon: Icon,
  hint,
  current,
  previous,
  loading,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  /** kalau diisi, tampil perubahan persen vs `previous` */
  current?: number;
  previous?: number;
  loading?: boolean;
}) {
  const change =
    current !== undefined && previous !== undefined ? percentChange(current, previous) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center justify-between gap-2">
          {title}
          <Icon className="size-4 text-muted-foreground" aria-hidden />
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">
          {loading ? <Skeleton className="h-8 w-32" /> : value}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {change !== undefined && !loading && <ChangeLabel change={change} />}
        {hint && <span>{hint}</span>}
      </CardContent>
    </Card>
  );
}

function ChangeLabel({ change }: { change: number | null }) {
  if (change === null) return <span>belum ada data bulan lalu</span>;
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
      <Icon className="size-3.5" aria-hidden />
      {change > 0 ? "+" : ""}
      {change.toFixed(1).replace(".", ",")}% vs bulan lalu
    </span>
  );
}
