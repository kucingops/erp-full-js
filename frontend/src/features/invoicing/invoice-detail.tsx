"use client";

import { ArrowLeft, Banknote, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
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
import { MoneyWithBase } from "@/features/currencies/components";
import { formatMoney, formatRate, isForeign } from "@/features/currencies/format";
import { PrintButtons } from "@/features/documents/print-buttons";
import { formatDate } from "@/features/sales-orders/format";
import { useAuthStore } from "@/lib/auth-store";
import { canAccess } from "@/lib/navigation";
import { useDeleteInvoice, useDeletePayment, useInvoice } from "./api";
import { INVOICE_CONFIGS, type InvoiceConfig } from "./config";
import { PaymentFormDialog } from "./payment-form-dialog";
import { InvoiceStatusBadge } from "./status-badge";
import { PAYMENT_METHOD_LABEL } from "./types";

export function InvoiceDetail({ resource }: { resource: InvoiceConfig["resource"] }) {
  const cfg = INVOICE_CONFIGS[resource];
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: inv, isLoading } = useInvoice(cfg, id);
  const removeInvoice = useDeleteInvoice(cfg);
  const removePayment = useDeletePayment(cfg, id);
  const [paying, setPaying] = useState(false);
  const role = useAuthStore((s) => s.user?.role);

  if (isLoading || !inv) return <Skeleton className="h-64 w-full" />;

  const canWrite = canAccess(role, cfg.roles);
  const order = cfg.orderOf(inv);
  const items = (inv.salesOrder ?? inv.purchaseOrder)?.items ?? [];
  const cur = inv.currencyCode;
  const money = (v: string) => formatMoney(v, cur);
  const paidPct = Math.min(100, (Number(inv.paidAmount) / Number(inv.totalAmount)) * 100 || 0);

  return (
    <>
      <PageHeader
        title={inv.number}
        description={`${cfg.docLabel} · ${cfg.partnerOf(inv)?.name ?? "-"}`}
        actions={
          <>
            <Button variant="outline" render={<Link href={`/${cfg.resource}`} />}>
              <ArrowLeft /> Kembali
            </Button>
            <PrintButtons resource={`/${cfg.resource}`} id={inv.id} number={inv.number} />
            {canWrite && inv.payments.length === 0 && (
              <Button
                variant="outline"
                disabled={removeInvoice.isPending}
                onClick={() => {
                  if (window.confirm(`Hapus ${inv.number}? Order bisa ditagih ulang.`)) {
                    removeInvoice.mutate(inv.id, { onSuccess: () => router.push(`/${cfg.resource}`) });
                  }
                }}
              >
                <Trash2 /> Hapus
              </Button>
            )}
            {canWrite && inv.status !== "PAID" && (
              <Button onClick={() => setPaying(true)}>
                <Banknote /> Catat pembayaran
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6">
        <Card>
          <CardContent className="grid gap-4 text-sm md:grid-cols-3">
            <Info label="Status">
              <InvoiceStatusBadge status={inv.status} isOverdue={inv.isOverdue} />
            </Info>
            <Info label={cfg.orderLabel}>
              {order ? (
                <Link className="hover:underline" href={`${cfg.orderPath}/${order.id}`}>
                  {order.number}
                </Link>
              ) : (
                "-"
              )}
            </Info>
            <Info label="Dibuat oleh">{inv.createdBy.name}</Info>
            <Info label="Tanggal">{formatDate(inv.issueDate)}</Info>
            <Info label="Jatuh tempo">{formatDate(inv.dueDate)}</Info>
            <Info label="Mata uang">
              {isForeign(cur) ? `${cur} · kurs ${formatRate(inv.exchangeRate)}` : cur}
            </Info>
            <Info label="Catatan">{inv.notes || "-"}</Info>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3">
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <Info label="Total">
                <MoneyWithBase amount={inv.totalAmount} currencyCode={cur} baseAmount={inv.totalAmountBase} />
              </Info>
              <Info label="Sudah dibayar">{money(inv.paidAmount)}</Info>
              <Info label="Sisa">
                <span className="text-lg font-semibold">
                  <MoneyWithBase
                    amount={inv.outstandingAmount}
                    currencyCode={cur}
                    baseAmount={inv.outstandingAmountBase}
                  />
                </span>
              </Info>
            </div>
            <div
              className="h-2 rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.round(paidPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Persentase terbayar"
            >
              <div className="h-2 rounded-full bg-primary" style={{ width: `${paidPct}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pembayaran</CardTitle>
          </CardHeader>
          <CardContent>
            {inv.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada pembayaran.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead>Referensi</TableHead>
                    <TableHead>Dicatat oleh</TableHead>
                    {isForeign(cur) && <TableHead className="text-right">Kurs</TableHead>}
                    <TableHead className="text-right">Jumlah</TableHead>
                    {canWrite && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inv.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.paidAt)}</TableCell>
                      <TableCell>{PAYMENT_METHOD_LABEL[p.method]}</TableCell>
                      <TableCell>{p.reference || p.notes || "-"}</TableCell>
                      <TableCell>{p.createdBy.name}</TableCell>
                      {isForeign(cur) && (
                        <TableCell className="text-right">{formatRate(p.exchangeRate)}</TableCell>
                      )}
                      <TableCell className="text-right">
                        <MoneyWithBase amount={p.amount} currencyCode={cur} baseAmount={p.amountBase} />
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Hapus pembayaran"
                            disabled={removePayment.isPending}
                            onClick={() => {
                              if (window.confirm(`Hapus pembayaran ${money(p.amount)}?`)) {
                                removePayment.mutate(p.id);
                              }
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Item {order?.number}</CardTitle>
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
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.product.sku}</TableCell>
                    <TableCell>{i.product.name}</TableCell>
                    <TableCell className="text-right">
                      {i.quantity} {i.product.unit}
                    </TableCell>
                    <TableCell className="text-right">{money(i.unitPrice)}</TableCell>
                    <TableCell className="text-right">{money(i.subtotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <PaymentFormDialog cfg={cfg} invoice={inv} open={paying} onOpenChange={setPaying} />
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
