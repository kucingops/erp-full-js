"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListQuery } from "@/hooks/use-list-query";
import { CATEGORIES_KEY, PRODUCTS_KEY, useSaveResource } from "./api";
import { FormField } from "./components";
import type { Category, Product } from "./types";

const NO_CATEGORY = "none";
const UNITS = ["pcs", "box", "dus", "pak", "lusin", "kg", "liter"];

// Aturan sama dengan CreateProductDto di backend supaya error muncul sebelum request.
const money = z
  .number({ error: "Wajib diisi angka" })
  .min(0, "Tidak boleh negatif")
  // Toleransi kecil karena floating point (0.1 * 100 = 10.000000000000002).
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, {
    error: "Maksimal 2 angka desimal",
  });

const schema = z.object({
  sku: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,50}$/, "2-50 karakter: huruf, angka, - atau _"),
  name: z.string().trim().min(2, "Minimal 2 karakter").max(150),
  description: z.string().max(1000),
  unit: z.string().trim().min(1, "Wajib diisi").max(20),
  categoryId: z.string(),
  costPrice: money,
  salePrice: money,
  minStock: z.number({ error: "Wajib diisi angka" }).int("Harus bilangan bulat").min(0),
});
type FormValues = z.infer<typeof schema>;

export interface ProductInput {
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  categoryId: string | null;
  costPrice: number;
  salePrice: number;
  minStock: number;
  isActive: boolean;
}

export function useSaveProduct() {
  return useSaveResource<Product, ProductInput>(PRODUCTS_KEY, "Produk");
}

const EMPTY: FormValues = {
  sku: "",
  name: "",
  description: "",
  unit: "pcs",
  categoryId: NO_CATEGORY,
  costPrice: 0,
  salePrice: 0,
  minStock: 0,
};

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
}) {
  const save = useSaveProduct();
  const categories = useListQuery<Category>(CATEGORIES_KEY, {
    limit: 100,
    sortBy: "name",
    sortOrder: "asc",
  });
  const categoryName = new Map(categories.data?.data.map((c) => [c.id, c.name]));

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (!open) return;
    form.reset(
      product
        ? {
            sku: product.sku,
            name: product.name,
            description: product.description ?? "",
            unit: product.unit,
            categoryId: product.categoryId ?? NO_CATEGORY,
            costPrice: Number(product.costPrice),
            salePrice: Number(product.salePrice),
            minStock: product.minStock,
          }
        : EMPTY,
    );
  }, [open, product, form]);

  const onSubmit = form.handleSubmit((v) =>
    save.mutate(
      {
        id: product?.id,
        ...v,
        sku: v.sku.toUpperCase(),
        description: v.description.trim() || null,
        categoryId: v.categoryId === NO_CATEGORY ? null : v.categoryId,
      },
      { onSuccess: () => onOpenChange(false) },
    ),
  );

  const [salePrice, costPrice] = useWatch({
    control: form.control,
    name: ["salePrice", "costPrice"],
  });
  const margin = (salePrice ?? 0) - (costPrice ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{product ? "Edit produk" : "Tambah produk"}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <FormField id="sku" label="SKU" error={errors.sku?.message}>
              <Input id="sku" className="uppercase" {...form.register("sku")} />
            </FormField>
            <FormField id="name" label="Nama produk" error={errors.name?.message}>
              <Input id="name" {...form.register("name")} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Kategori">
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                    <SelectTrigger className="w-full" aria-label="Kategori">
                      <SelectValue>
                        {(v: string) =>
                          v === NO_CATEGORY ? "Tanpa kategori" : (categoryName.get(v) ?? "...")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>Tanpa kategori</SelectItem>
                      {categories.data?.data.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField id="unit" label="Satuan" error={errors.unit?.message}>
              <Input id="unit" list="unit-options" {...form.register("unit")} />
              <datalist id="unit-options">
                {UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="costPrice" label="Harga beli (Rp)" error={errors.costPrice?.message}>
              <Input
                id="costPrice"
                type="number"
                step="0.01"
                min={0}
                {...form.register("costPrice", { valueAsNumber: true })}
              />
            </FormField>
            <FormField id="salePrice" label="Harga jual (Rp)" error={errors.salePrice?.message}>
              <Input
                id="salePrice"
                type="number"
                step="0.01"
                min={0}
                {...form.register("salePrice", { valueAsNumber: true })}
              />
            </FormField>
            <FormField id="minStock" label="Stok minimum" error={errors.minStock?.message}>
              <Input
                id="minStock"
                type="number"
                step="1"
                min={0}
                {...form.register("minStock", { valueAsNumber: true })}
              />
            </FormField>
          </div>
          {Number.isFinite(margin) && margin < 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Harga jual lebih rendah dari harga beli.
            </p>
          )}
          <FormField id="description" label="Deskripsi (opsional)" error={errors.description?.message}>
            <Input id="description" {...form.register("description")} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
