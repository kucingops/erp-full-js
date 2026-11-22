"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateStockOpname, useOptions } from "./api";

const ALL = "ALL";

/**
 * Buat opname = snapshot qty sistem saat ini. Cakupan: semua produk aktif atau satu kategori.
 * (API juga menerima `productIds` untuk produk tertentu.)
 */
export function OpnameCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const create = useCreateStockOpname();
  const warehouses = useOptions("warehouses");
  const categories = useOptions("categories");
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState(ALL);
  const [notes, setNotes] = useState("");

  const submit = () =>
    create.mutate(
      {
        warehouseId,
        categoryId: categoryId === ALL ? undefined : categoryId,
        notes: notes || undefined,
      },
      {
        onSuccess: (o) => {
          onOpenChange(false);
          router.push(`/stock-opnames/${o.id}`);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat stock opname</DialogTitle>
          <DialogDescription>
            Qty sistem di-snapshot sekarang. Hitung fisik dianggap terjadi saat snapshot ini.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Gudang</Label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) => {
                    const w = warehouses.data?.find((x) => x.id === v);
                    return w ? `${w.code} · ${w.name}` : "Pilih gudang";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {warehouses.data?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Cakupan produk</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string) =>
                    v === ALL
                      ? "Semua produk aktif"
                      : `Kategori: ${categories.data?.find((c) => c.id === v)?.name ?? "-"}`
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua produk aktif</SelectItem>
                {categories.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    Kategori: {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="opname-notes">Catatan</Label>
            <Input id="opname-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button disabled={!warehouseId || create.isPending} onClick={submit}>
            {create.isPending ? "Membuat..." : "Buat lembar hitung"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
