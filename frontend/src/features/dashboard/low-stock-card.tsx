"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLowStock } from "./api";
import { formatNumber } from "./format";

/** Daftar produk yang total stoknya (semua gudang) sudah di bawah/sama dengan minimum. */
export function LowStockCard({ total }: { total?: number }) {
  const { data, isLoading } = useLowStock(5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stok menipis</CardTitle>
        <CardDescription>
          {total ? `${formatNumber(total)} produk di bawah stok minimum` : "Produk dengan stok di bawah minimum"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Semua stok aman.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead className="text-right">Stok</TableHead>
                <TableHead className="text-right">Min.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.sku}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.totalStock === 0 ? (
                      <Badge variant="destructive">
                        <AlertTriangle aria-hidden /> Habis
                      </Badge>
                    ) : (
                      `${formatNumber(p.totalStock)} ${p.unit}`
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatNumber(p.minStock)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
