"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
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
import { useDebounce } from "@/hooks/use-debounce";
import { useCreateAdjustment, useProductOptions, useWarehouseOptions } from "./api";
import type { ProductRef, Stock, WarehouseRef } from "./types";

const DIRECTION_LABEL = { add: "Tambah (+)", subtract: "Kurangi (−)" } as const;
type Direction = keyof typeof DIRECTION_LABEL;

const schema = z.object({
  productId: z.uuid("Pilih produk"),
  warehouseId: z.uuid("Pilih gudang"),
  direction: z.enum(["add", "subtract"]),
  amount: z.coerce.number<string>().int("Harus bilangan bulat").min(1, "Minimal 1"),
  note: z.string().trim().min(3, "Alasan minimal 3 karakter").max(500),
});
type FormValues = z.infer<typeof schema>;

/**
 * Form penyesuaian stok manual. Kalau `stock` diisi (klik dari baris tabel),
 * produk & gudang sudah terpilih dan saldo saat ini ditampilkan.
 */
export function AdjustmentFormDialog({
  open,
  onOpenChange,
  stock,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stock?: Stock | null;
}) {
  const create = useCreateAdjustment();
  const [productSearch, setProductSearch] = useState("");
  const products = useProductOptions(useDebounce(productSearch));
  const warehouses = useWarehouseOptions();

  const form = useForm<z.input<typeof schema>, unknown, FormValues>({
    resolver: zodResolver(schema),
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) {
      form.reset({
        productId: stock?.productId ?? "",
        warehouseId: stock?.warehouseId ?? "",
        direction: "add",
        amount: "1",
        note: "",
      });
    }
  }, [open, stock, form]);

  // Pastikan produk/gudang preset tetap ada di opsi walau tidak masuk hasil pencarian.
  const productOptions = useMemo(
    () => withPreset<ProductRef>(products.data, stock?.product),
    [products.data, stock],
  );
  const warehouseOptions = useMemo(
    () => withPreset<WarehouseRef>(warehouses.data, stock?.warehouse),
    [warehouses.data, stock],
  );

  // Kosongkan pencarian produk saat dialog ditutup (bukan di useEffect, supaya tidak render berantai).
  const handleOpenChange = (next: boolean) => {
    if (!next) setProductSearch("");
    onOpenChange(next);
  };

  const onSubmit = form.handleSubmit(({ direction, amount, ...v }) =>
    create.mutate(
      { ...v, quantity: direction === "add" ? amount : -amount },
      { onSuccess: () => handleOpenChange(false) },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Penyesuaian stok</DialogTitle>
          <DialogDescription>
            {stock
              ? `${stock.product.name} di ${stock.warehouse.name}: saldo saat ini ${stock.quantity} ${stock.product.unit}`
              : "Koreksi stok manual, misalnya hasil stock opname atau barang rusak."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label>Produk</Label>
            {!stock && (
              <Input
                placeholder="Cari nama / SKU produk..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            )}
            <Controller
              control={form.control}
              name="productId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => field.onChange(v)} disabled={!!stock}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih produk">
                      {(v: string) => label(productOptions.find((p) => p.id === v))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {productOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {label(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.productId && <p className="text-sm text-destructive">{errors.productId.message}</p>}
          </div>

          <div className="grid gap-2">
            <Label>Gudang</Label>
            <Controller
              control={form.control}
              name="warehouseId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => field.onChange(v)} disabled={!!stock}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih gudang">
                      {(v: string) => warehouseOptions.find((w) => w.id === v)?.name ?? ""}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {warehouseOptions.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.warehouseId && (
              <p className="text-sm text-destructive">{errors.warehouseId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Arah</Label>
              <Controller
                control={form.control}
                name="direction"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => field.onChange(v as Direction)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: Direction) => DIRECTION_LABEL[v]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(DIRECTION_LABEL) as Direction[]).map((d) => (
                        <SelectItem key={d} value={d}>
                          {DIRECTION_LABEL[d]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">Jumlah</Label>
              <Input id="amount" type="number" min={1} step={1} {...form.register("amount")} />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="note">Alasan</Label>
            <Input id="note" placeholder="Contoh: stock opname, 2 pcs rusak" {...form.register("note")} />
            {errors.note && <p className="text-sm text-destructive">{errors.note.message}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function label(p?: ProductRef) {
  return p ? `${p.sku} · ${p.name}` : "";
}

function withPreset<T extends { id: string }>(list: T[] | undefined, preset?: T) {
  const items = list ?? [];
  return preset && !items.some((i) => i.id === preset.id) ? [preset, ...items] : items;
}
