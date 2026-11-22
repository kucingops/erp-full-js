"use client";

import { ArrowLeft, Check, Truck, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDeleteSalesOrder,
  useSalesOrder,
  useSalesOrderAction,
  type SalesOrderAction,
} from "@/features/sales-orders/api";
import { formatDate, formatIDR } from "@/features/sales-orders/format";
import { SalesOrderStatusBadge } from "@/features/sales-orders/status-badge";
import { useAuthStore } from "@/lib/auth-store";
import { canAccess } from "@/lib/navigation";

const CONFIRM: Record<SalesOrderAction, string> = {
  confirm: "Konfirmasi SO ini? Stok akan dicek dulu.",
  ship: "Kirim semua barang? Stok gudang akan berkurang.",
  cancel: "Batalkan SO ini?",
};

export function SalesOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: so, isLoading } = useSalesOrder(id);
  const action = useSalesOrderAction();
  const remove = useDeleteSalesOrder();
  const role = useAuthStore((s) => s.user?.role);

  if (isLoading || !so) return <Skeleton className="h-64 w-full" />;

  // Tombol mengikuti status + role (sama dengan @Roles di backend).
  const isSales = canAccess(role, ["SALES"]);
  const isWarehouse = canAccess(role, ["WAREHOUSE"]);
  const busy = action.isPending || remove.isPending;
  const run = (a: SalesOrderAction) => {
    if (window.confirm(CONFIRM[a])) action.mutate({ id: so.id, action: a });
  };

  return (
    <>
      <PageHeader
        title={so.number}
        description={`${so.customer.name} → ${so.warehouse.name}`}
        actions={
          <>
            <Button variant="outline" render={<Link href="/sales-orders" />}>
              <ArrowLeft /> Kembali
            </Button>
            {so.status === "DRAFT" && isSales && (
              <>
                <Button variant="outline" render={<Link href={`/sales-orders/${so.id}/edit`} />}>
                  <Pencil /> Edit
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Hapus draft SO ini?")) {
                      remove.mutate(so.id, { onSuccess: () => router.push("/sales-orders") });
                    }
                  }}
                >
                  <Trash2 /> Hapus
                </Button>
                <Button disabled={busy} onClick={() => run("confirm")}>
                  <Check /> Konfirmasi
                </Button>
              </>
            )}
            {so.status === "CONFIRMED" && isWarehouse && (
              <Button disabled={busy} onClick={() => run("ship")}>
                <Truck /> Kirim barang
              </Button>
            )}
            {(so.status === "DRAFT" || so.status === "CONFIRMED") && isSales && (
              <Button variant="destructive" disabled={busy} onClick={() => run("cancel")}>
                <X /> Batalkan
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6">
        <Card>
          <CardContent className="grid gap-4 text-sm md:grid-cols-3">
            <Info label="Status">
              <SalesOrderStatusBadge status={so.status} />
            </Info>
            <Info label="Tanggal SO">{formatDate(so.orderDate)}</Info>
            <Info label="Dibuat oleh">{so.createdBy.name}</Info>
            <Info label="Dikonfirmasi">{so.confirmedAt ? formatDate(so.confirmedAt) : "-"}</Info>
            <Info label="Dikirim">{so.shippedAt ? formatDate(so.shippedAt) : "-"}</Info>
            <Info label="Catatan">{so.notes || "-"}</Info>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Item</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {so.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.product.sku}</TableCell>
                    <TableCell>{i.product.name}</TableCell>
                    <TableCell className="text-right">
                      {i.quantity} {i.product.unit}
                    </TableCell>
                    <TableCell className="text-right">{formatIDR(i.unitPrice)}</TableCell>
                    <TableCell className="text-right">{formatIDR(i.subtotal)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatIDR(so.totalAmount)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
