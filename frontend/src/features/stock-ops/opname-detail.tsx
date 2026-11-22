"use client";

import { AlertTriangle, ArrowLeft, CheckCheck, ClipboardCheck, Save, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
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
import { useSaveOpnameCounts, useStockOpname, useStockOpnameAction } from "./api";
import { formatDateTime, Info, OpnameStatusBadge, Variance } from "./components";
import type { StockOpnameDetail as Detail } from "./types";

export function StockOpnameDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: opn, isLoading } = useStockOpname(id);
  if (isLoading || !opn) return <Skeleton className="h-64 w-full" />;
  // key = status: input lokal di-reset kalau status berubah (post/cancel)
  return <OpnameView key={opn.status} opn={opn} />;
}

/** Nilai input → angka hitung, atau null kalau kosong. */
const parseCount = (v: string | undefined) => (v === undefined || v.trim() === "" ? null : Number(v));

function OpnameView({ opn }: { opn: Detail }) {
  const save = useSaveOpnameCounts();
  const action = useStockOpnameAction();
  const role = useAuthStore((s) => s.user?.role);
  const editable = opn.status === "DRAFT" && canAccess(role, ["WAREHOUSE"]);
  const busy = save.isPending || action.isPending;
  const [filter, setFilter] = useState("");

  // Lembar hitung lokal: productId → string input ("" = belum dihitung)
  const initial = useMemo(
    () =>
      Object.fromEntries(
        opn.lines.map((l) => [l.productId, l.countedQty === null ? "" : String(l.countedQty)]),
      ),
    [opn.lines],
  );
  const [counts, setCounts] = useState<Record<string, string>>(initial);
  const dirty = opn.lines.some((l) => (counts[l.productId] ?? "") !== initial[l.productId]);
  const invalid = opn.lines.some((l) => {
    const c = parseCount(counts[l.productId]);
    return c !== null && (!Number.isInteger(c) || c < 0);
  });
  const uncounted = opn.lines.filter((l) => parseCount(counts[l.productId]) === null).length;
  const moved = opn.lines.filter(
    (l) => l.currentQty !== null && l.currentQty !== l.systemQty,
  ).length;

  const shown = opn.lines.filter((l) => {
    const q = filter.trim().toLowerCase();
    return !q || l.product.sku.toLowerCase().includes(q) || l.product.name.toLowerCase().includes(q);
  });

  const onSave = () =>
    save.mutate({
      id: opn.id,
      lines: opn.lines
        .filter((l) => (counts[l.productId] ?? "") !== initial[l.productId])
        .map((l) => ({ productId: l.productId, countedQty: parseCount(counts[l.productId]) })),
    });

  /** Isi baris yang masih kosong dengan qty sistem (snapshot), biar cepat kalau mayoritas cocok. */
  const fillEmpty = () =>
    setCounts((s) =>
      Object.fromEntries(
        opn.lines.map((l) => [
          l.productId,
          (s[l.productId] ?? "") === "" ? String(l.systemQty) : s[l.productId],
        ]),
      ),
    );

  const totals = opn.lines.reduce(
    (acc, l) => {
      const c = opn.status === "POSTED" ? l.countedQty : parseCount(counts[l.productId]);
      if (c === null || Number.isNaN(c)) return acc;
      const v = c - l.systemQty;
      if (v > 0) acc.plus += v;
      if (v < 0) acc.minus += v;
      return acc;
    },
    { plus: 0, minus: 0 },
  );

  return (
    <>
      <PageHeader
        title={opn.number}
        description={`Stock opname ${opn.warehouse.name}`}
        actions={
          <>
            <Button variant="outline" render={<Link href="/stock-opnames" />}>
              <ArrowLeft /> Kembali
            </Button>
            {editable && (
              <>
                <Button variant="outline" disabled={busy} onClick={fillEmpty}>
                  <CheckCheck /> Isi kosong = sistem
                </Button>
                <Button variant="outline" disabled={busy || !dirty || invalid} onClick={onSave}>
                  <Save /> Simpan hitungan
                </Button>
                <Button
                  disabled={busy || dirty || uncounted > 0}
                  title={dirty ? "Simpan hitungan dulu" : uncounted > 0 ? "Masih ada yang belum dihitung" : undefined}
                  onClick={() => {
                    if (window.confirm("Posting opname? Semua selisih akan dibukukan ke stok dan tidak bisa diubah lagi.")) {
                      action.mutate({ id: opn.id, action: "post" });
                    }
                  }}
                >
                  <ClipboardCheck /> Posting
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Batalkan opname ini? Stok tidak berubah.")) {
                      action.mutate({ id: opn.id, action: "cancel" });
                    }
                  }}
                >
                  <X /> Batalkan
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-6">
        <Card>
          <CardContent className="grid gap-4 text-sm md:grid-cols-3">
            <Info label="Status">
              <OpnameStatusBadge status={opn.status} />
            </Info>
            <Info label="Gudang">{`${opn.warehouse.code} · ${opn.warehouse.name}`}</Info>
            <Info label="Dibuat oleh">{opn.createdBy.name}</Info>
            <Info label="Snapshot">{formatDateTime(opn.snapshotAt)}</Info>
            <Info label="Diposting">{opn.postedAt ? formatDateTime(opn.postedAt) : "-"}</Info>
            <Info label="Catatan">{opn.notes || "-"}</Info>
            <Info label="Produk">
              {opn.lines.length} baris
              {opn.status === "DRAFT" && ` · ${uncounted} belum dihitung`}
            </Info>
            <Info label="Total selisih">
              <span className="text-green-600">+{totals.plus}</span> /{" "}
              <span className="text-destructive">{totals.minus}</span>
            </Info>
          </CardContent>
        </Card>

        {opn.status === "DRAFT" && moved > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>
              {moved} produk sudah ada transaksi setelah snapshot. Saat posting, yang dibukukan tetap
              selisih <b>hitung − qty snapshot</b> (transaksi setelah snapshot tidak tertimpa).
            </span>
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>Lembar hitung</CardTitle>
            <Input
              className="max-w-64"
              placeholder="Cari SKU / nama..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Qty sistem (snapshot)</TableHead>
                  <TableHead className="text-right">
                    {opn.status === "DRAFT" ? "Stok sekarang" : "Saldo saat posting"}
                  </TableHead>
                  <TableHead className="text-right">Hitung fisik</TableHead>
                  <TableHead className="text-right">Selisih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((l) => {
                  const c = opn.status === "DRAFT" ? parseCount(counts[l.productId]) : l.countedQty;
                  const ref = opn.status === "DRAFT" ? l.currentQty : l.qtyAtPost;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.product.sku}</TableCell>
                      <TableCell>{l.product.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.systemQty}</TableCell>
                      <TableCell
                        className={
                          ref !== null && ref !== l.systemQty
                            ? "text-right tabular-nums text-amber-600"
                            : "text-right tabular-nums text-muted-foreground"
                        }
                      >
                        {ref ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {editable ? (
                          <Input
                            type="number"
                            min={0}
                            className="ml-auto w-24 text-right"
                            aria-label={`Hitung fisik ${l.product.name}`}
                            value={counts[l.productId] ?? ""}
                            onChange={(e) =>
                              setCounts((s) => ({ ...s, [l.productId]: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="tabular-nums">{l.countedQty ?? "-"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Variance
                          value={
                            opn.status === "POSTED"
                              ? l.variance
                              : c === null || Number.isNaN(c)
                                ? null
                                : c - l.systemQty
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Tidak ada produk yang cocok
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {invalid && (
              <p className="pt-2 text-sm text-destructive">Hitung fisik harus bilangan bulat ≥ 0.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
