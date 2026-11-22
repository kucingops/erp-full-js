"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Building2,
  ClipboardList,
  Package,
  Users,
  UserSquare,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardSummary } from "@/features/dashboard/api";
import { formatIDR, formatMonth, formatNumber } from "@/features/dashboard/format";
import { KpiCard } from "@/features/dashboard/kpi-card";
import { LowStockCard } from "@/features/dashboard/low-stock-card";
import { TrendChart } from "@/features/dashboard/trend-chart";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Dashboard role-aware: backend sudah menyaring data per role (bagian yang tidak
 * boleh dilihat = null), FE tinggal menyembunyikan kartu yang null.
 */
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, error } = useDashboardSummary();
  const loading = isLoading || !data;

  const pending: string[] = [];
  if (data?.sales) pending.push(`${data.sales.byStatus.CONFIRMED ?? 0} SO siap kirim`);
  if (data?.purchases) pending.push(`${data.purchases.byStatus.APPROVED ?? 0} PO menunggu barang`);
  const drafts = (data?.sales?.byStatus.DRAFT ?? 0) + (data?.purchases?.byStatus.DRAFT ?? 0);

  const counts = data
    ? [
        { label: "Produk aktif", value: data.counts.products, icon: Package },
        { label: "Gudang", value: data.counts.warehouses, icon: Warehouse },
        { label: "Customer", value: data.counts.customers, icon: UserSquare },
        { label: "Supplier", value: data.counts.suppliers, icon: Building2 },
        { label: "User aktif", value: data.counts.users, icon: Users },
      ].filter((c): c is typeof c & { value: number } => c.value !== null)
    : [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Halo ${user?.name ?? ""}, ini ringkasan ${data ? formatMonth(data.month) : "bulan ini"}.`}
      />

      {isError && (
        <p className="mb-4 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          Gagal memuat dashboard: {error.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(loading || data.sales) && (
          <KpiCard
            title="Penjualan bulan ini"
            icon={ArrowUpFromLine}
            loading={loading}
            value={formatIDR(data?.sales?.total ?? 0)}
            current={data?.sales ? Number(data.sales.total) : undefined}
            previous={data?.sales ? Number(data.sales.previousTotal) : undefined}
            hint={data?.sales ? `${formatNumber(data.sales.orderCount)} SO` : undefined}
          />
        )}
        {(loading || data.purchases) && (
          <KpiCard
            title="Pembelian bulan ini"
            icon={ArrowDownToLine}
            loading={loading}
            value={formatIDR(data?.purchases?.total ?? 0)}
            current={data?.purchases ? Number(data.purchases.total) : undefined}
            previous={data?.purchases ? Number(data.purchases.previousTotal) : undefined}
            hint={data?.purchases ? `${formatNumber(data.purchases.orderCount)} PO` : undefined}
          />
        )}
        <KpiCard
          title="Produk stok menipis"
          icon={Boxes}
          loading={loading}
          value={formatNumber(data?.inventory?.lowStockCount ?? 0)}
          hint="total stok ≤ stok minimum"
        />
        <KpiCard
          title="Dokumen draft"
          icon={ClipboardList}
          loading={loading}
          value={formatNumber(drafts)}
          hint={pending.join(" · ") || undefined}
        />
      </div>

      {counts.length > 0 && (
        <Card size="sm" className="mt-4">
          <CardContent className="flex flex-wrap gap-x-8 gap-y-2">
            {counts.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-nums">{formatNumber(value)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart />
        </div>
        <LowStockCard total={data?.inventory?.lowStockCount} />
      </div>
    </>
  );
}
