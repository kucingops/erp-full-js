"use client";

import { ArrowLeft, PackageCheck, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthStore } from "@/lib/auth-store";
import { canAccess } from "@/lib/navigation";
import {
  useDeleteStockTransfer,
  useStockTransfer,
  useStockTransferAction,
  type StockTransferAction,
} from "./api";
import { formatDate, formatDateTime, Info, TransferStatusBadge, Variance } from "./components";
import type { StockTransferDetail as Detail } from "./types";

const CONFIRM: Record<StockTransferAction, string> = {
  send: "Kirim transfer ini? Stok gudang asal akan langsung berkurang.",
  receive: "Terima barang dengan qty di tabel? Stok gudang tujuan akan bertambah.",
  cancel: "Batalkan transfer ini?",
};

export function StockTransferDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: trf, isLoading } = useStockTransfer(id);
  if (isLoading || !trf) return <Skeleton className="h-64 w-full" />;
  // key = status: state input qty diterima di-reset kalau status berubah
  return <TransferView key={trf.status} trf={trf} />;
}

function TransferView({ trf }: { trf: Detail }) {
  const router = useRouter();
  const action = useStockTransferAction();
  const remove = useDeleteStockTransfer();
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = canAccess(role, ["WAREHOUSE"]);
  const busy = action.isPending || remove.isPending;
  const isSent = trf.status === "SENT";

  // Qty diterima per produk (hanya saat SENT). Default = qty kirim.
  const [received, setReceived] = useState<Record<string, string>>(() =>
    Object.fromEntries(trf.items.map((i) => [i.productId, String(i.quantity)])),
  );
  const receivedItems = trf.items.map((i) => ({
    productId: i.productId,
    receivedQuantity: Number(received[i.productId]),
  }));
  const receiveInvalid = receivedItems.some(
    (r, idx) =>
      !Number.isInteger(r.receivedQuantity) ||
      r.receivedQuantity < 0 ||
      r.receivedQuantity > trf.items[idx].quantity,
  );

  const run = (a: StockTransferAction) => {
    const message =
      a === "cancel" && isSent
        ? "Batalkan transfer yang sudah dikirim? Stok akan dikembalikan ke gudang asal."
        : CONFIRM[a];
    if (!window.confirm(message)) return;
    action.mutate({ id: trf.id, action: a, items: a === "receive" ? receivedItems : undefined });
  };

  return (
    <>
      <PageHeader
        title={trf.number}
        description={`${trf.fromWarehouse.name} → ${trf.toWarehouse.name}`}
        actions={
          <>
            <Button variant="outline" render={<Link href="/stock-transfers" />}>
              <ArrowLeft /> Kembali
            </Button>
            {canWrite && trf.status === "DRAFT" && (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Hapus draft transfer ini?")) {
                      remove.mutate(trf.id, { onSuccess: () => router.push("/stock-transfers") });
                    }
                  }}
                >
                  <Trash2 /> Hapus
                </Button>
                <Button disabled={busy} onClick={() => run("send")}>
                  <Send /> Kirim
                </Button>
              </>
            )}
            {canWrite && isSent && (
              <Button disabled={busy || receiveInvalid} onClick={() => run("receive")}>
                <PackageCheck /> Terima barang
              </Button>
            )}
            {canWrite && (trf.status === "DRAFT" || isSent) && (
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
              <TransferStatusBadge status={trf.status} />
            </Info>
            <Info label="Tanggal">{formatDate(trf.transferDate)}</Info>
            <Info label="Dibuat oleh">{trf.createdBy.name}</Info>
            <Info label="Dikirim">{trf.sentAt ? formatDateTime(trf.sentAt) : "-"}</Info>
            <Info label="Diterima">{trf.receivedAt ? formatDateTime(trf.receivedAt) : "-"}</Info>
            <Info label="Dibatalkan">{trf.cancelledAt ? formatDateTime(trf.cancelledAt) : "-"}</Info>
            <Info label="Catatan">{trf.notes || "-"}</Info>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Item</CardTitle>
            {isSent && canWrite && (
              <p className="text-sm text-muted-foreground">
                Isi qty yang benar-benar diterima. Kekurangan dianggap hilang/rusak di jalan dan
                tidak dikembalikan ke gudang asal.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Qty kirim</TableHead>
                  <TableHead className="text-right">Qty diterima</TableHead>
                  <TableHead className="text-right">Selisih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trf.items.map((i) => {
                  const rq = isSent ? Number(received[i.productId]) : i.receivedQuantity;
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.product.sku}</TableCell>
                      <TableCell>{i.product.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i.quantity} {i.product.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {isSent && canWrite ? (
                          <Input
                            type="number"
                            min={0}
                            max={i.quantity}
                            className="ml-auto w-24 text-right"
                            aria-label={`Qty diterima ${i.product.name}`}
                            value={received[i.productId] ?? ""}
                            onChange={(e) =>
                              setReceived((s) => ({ ...s, [i.productId]: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="tabular-nums">{i.receivedQuantity ?? "-"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Variance
                          value={rq === null || Number.isNaN(rq) ? null : rq - i.quantity}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {isSent && receiveInvalid && (
              <p className="pt-2 text-sm text-destructive">
                Qty diterima harus bilangan bulat 0 s.d. qty kirim.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
