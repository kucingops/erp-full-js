"use client";

import { ArrowLeft, Check, PackageCheck, Pencil, Trash2, X } from "lucide-react";
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
  useDeletePurchaseOrder,
  usePurchaseOrder,
  usePurchaseOrderAction,
  type PurchaseOrderAction,
} from "@/features/purchase-orders/api";
import { formatDate, formatIDR } from "@/features/purchase-orders/format";
import { PurchaseOrderStatusBadge } from "@/features/purchase-orders/status-badge";
import { useAuthStore } from "@/lib/auth-store";
import { canAccess } from "@/lib/navigation";

const CONFIRM: Record<PurchaseOrderAction, string> = {
  approve: "Setujui PO ini?",
  receive: "Terima semua barang? Stok gudang akan bertambah.",
  cancel: "Batalkan PO ini?",
};

export function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: po, isLoading } = usePurchaseOrder(id);
  const action = usePurchaseOrderAction();
  const remove = useDeletePurchaseOrder();
  const role = useAuthStore((s) => s.user?.role);

  if (isLoading || !po) return <Skeleton className="h-64 w-full" />;

  // Tombol mengikuti status + role (sama dengan @Roles di backend).
  const isPurchasing = canAccess(role, ["PURCHASING"]);
  const isWarehouse = canAccess(role, ["WAREHOUSE"]);
  const busy = action.isPending || remove.isPending;
  const run = (a: PurchaseOrderAction) => {
    if (window.confirm(CONFIRM[a])) action.mutate({ id: po.id, action: a });
  };

  return (
    <>
      <PageHeader
        title={po.number}
        description={`${po.supplier.name} → ${po.warehouse.name}`}
        actions={
          <>
            <Button variant="outline" render={<Link href="/purchase-orders" />}>
              <ArrowLeft /> Kembali
            </Button>
            {po.status === "DRAFT" && isPurchasing && (
              <>
                <Button variant="outline" render={<Link href={`/purchase-orders/${po.id}/edit`} />}>
                  <Pencil /> Edit
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Hapus draft PO ini?")) {
                      remove.mutate(po.id, { onSuccess: () => router.push("/purchase-orders") });
                    }
                  }}
                >
                  <Trash2 /> Hapus
                </Button>
                <Button disabled={busy} onClick={() => run("approve")}>
                  <Check /> Setujui
                </Button>
              </>
            )}
            {po.status === "APPROVED" && isWarehouse && (
              <Button disabled={busy} onClick={() => run("receive")}>
                <PackageCheck /> Terima barang
              </Button>
            )}
            {(po.status === "DRAFT" || po.status === "APPROVED") && isPurchasing && (
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
              <PurchaseOrderStatusBadge status={po.status} />
            </Info>
            <Info label="Tanggal PO">{formatDate(po.orderDate)}</Info>
            <Info label="Dibuat oleh">{po.createdBy.name}</Info>
            <Info label="Disetujui oleh">
              {po.approvedBy && po.approvedAt
                ? `${po.approvedBy.name} (${formatDate(po.approvedAt)})`
                : "-"}
            </Info>
            <Info label="Diterima">{po.receivedAt ? formatDate(po.receivedAt) : "-"}</Info>
            <Info label="Catatan">{po.notes || "-"}</Info>
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
                {po.items.map((i) => (
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
                    {formatIDR(po.totalAmount)}
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
