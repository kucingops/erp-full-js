"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";

// Placeholder: modul Dashboard akan isi ringkasan penjualan, pembelian, stok menipis.
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <>
      <PageHeader title="Dashboard" description={`Halo ${user?.name ?? ""}, ini ringkasan hari ini.`} />
      <div className="grid gap-4 md:grid-cols-3">
        {["Penjualan bulan ini", "Pembelian bulan ini", "Produk stok menipis"].map((t) => (
          <Card key={t}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{t}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">-</CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
