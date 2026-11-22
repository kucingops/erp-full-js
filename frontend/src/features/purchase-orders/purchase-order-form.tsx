"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOptions, useSavePurchaseOrder } from "./api";
import { formatIDR } from "./format";
import type { PurchaseOrderDetail } from "./types";

interface Option {
  id: string;
  name: string;
  code?: string;
  sku?: string;
  costPrice?: string;
}

const schema = z.object({
  supplierId: z.string().min(1, "Pilih supplier"),
  warehouseId: z.string().min(1, "Pilih gudang"),
  orderDate: z.string().min(1, "Isi tanggal"),
  notes: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Pilih produk"),
        quantity: z.number({ error: "Wajib angka" }).int("Bilangan bulat").min(1, "Minimal 1"),
        unitPrice: z.number({ error: "Wajib angka" }).min(0, "Tidak boleh negatif"),
      }),
    )
    .min(1, "Minimal 1 item")
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      "Produk yang sama tidak boleh dua kali",
    ),
});
type FormValues = z.infer<typeof schema>;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Form header + baris item (useFieldArray) untuk create dan edit draft PO.
 * Subtotal/total di sini hanya preview; angka resmi dihitung ulang di backend (Decimal).
 */
export function PurchaseOrderForm({ initial }: { initial?: PurchaseOrderDetail }) {
  const router = useRouter();
  const save = useSavePurchaseOrder();
  const suppliers = useOptions<Option>("suppliers");
  const warehouses = useOptions<Option>("warehouses");
  const products = useOptions<Option>("products");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          supplierId: initial.supplierId,
          warehouseId: initial.warehouseId,
          orderDate: initial.orderDate.slice(0, 10),
          notes: initial.notes ?? "",
          items: initial.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
          })),
        }
      : {
          supplierId: "",
          warehouseId: "",
          orderDate: today(),
          notes: "",
          items: [{ productId: "", quantity: 1, unitPrice: 0 }],
        },
  });
  const { errors } = form.formState;
  const items = useFieldArray({ control: form.control, name: "items" });
  const watched = useWatch({ control: form.control, name: "items" });
  const total = (watched ?? []).reduce(
    (sum, i) => sum + (Number(i?.quantity) || 0) * (Number(i?.unitPrice) || 0),
    0,
  );

  const onSubmit = form.handleSubmit((v) =>
    save.mutate(
      { ...v, id: initial?.id },
      { onSuccess: (po) => router.push(`/purchase-orders/${po.id}`) },
    ),
  );

  const productLabel = (id: string) => {
    const p = products.data?.find((x) => x.id === id);
    return p ? `${p.sku} · ${p.name}` : "Pilih produk";
  };

  return (
    <form className="grid gap-6" onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Informasi PO</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <RefSelect
            label="Supplier"
            name="supplierId"
            control={form.control}
            options={suppliers.data}
            error={errors.supplierId?.message}
          />
          <RefSelect
            label="Gudang tujuan"
            name="warehouseId"
            control={form.control}
            options={warehouses.data}
            error={errors.warehouseId?.message}
          />
          <div className="grid gap-2">
            <Label htmlFor="orderDate">Tanggal PO</Label>
            <Input id="orderDate" type="date" {...form.register("orderDate")} />
            {errors.orderDate && (
              <p className="text-sm text-destructive">{errors.orderDate.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Catatan</Label>
            <Input id="notes" {...form.register("notes")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Item</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => items.append({ productId: "", quantity: 1, unitPrice: 0 })}
          >
            <Plus /> Tambah item
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Produk</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Harga beli</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.fields.map((field, index) => {
                const rowErr = errors.items?.[index];
                const row = watched?.[index];
                return (
                  <TableRow key={field.id}>
                    <TableCell className="align-top">
                      <Controller
                        control={form.control}
                        name={`items.${index}.productId`}
                        render={({ field: f }) => (
                          <Select
                            value={f.value}
                            onValueChange={(v) => {
                              f.onChange(v as string);
                              // isi harga beli default dari master produk
                              const p = products.data?.find((x) => x.id === v);
                              if (p?.costPrice !== undefined) {
                                form.setValue(`items.${index}.unitPrice`, Number(p.costPrice));
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue>{(v: string) => productLabel(v)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {products.data?.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.sku} · {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {rowErr?.productId && (
                        <p className="text-sm text-destructive">{rowErr.productId.message}</p>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Input
                        type="number"
                        min={1}
                        className="w-24"
                        {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                      />
                      {rowErr?.quantity && (
                        <p className="text-sm text-destructive">{rowErr.quantity.message}</p>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-36"
                        {...form.register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                      />
                      {rowErr?.unitPrice && (
                        <p className="text-sm text-destructive">{rowErr.unitPrice.message}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right align-top">
                      {formatIDR((Number(row?.quantity) || 0) * (Number(row?.unitPrice) || 0))}
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Hapus item"
                        disabled={items.fields.length === 1}
                        onClick={() => items.remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {errors.items?.root && (
            <p className="text-sm text-destructive">{errors.items.root.message}</p>
          )}
          {errors.items?.message && (
            <p className="text-sm text-destructive">{errors.items.message}</p>
          )}
          <div className="flex justify-end pt-2 text-lg font-semibold">
            Total: {formatIDR(total)}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Batal
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Menyimpan..." : "Simpan draft"}
        </Button>
      </div>
    </form>
  );
}

/** Dropdown supplier/gudang. Label diambil dari daftar opsi (Base UI Select hanya tahu value). */
function RefSelect({
  label,
  name,
  control,
  options,
  error,
}: {
  label: string;
  name: "supplierId" | "warehouseId";
  control: ReturnType<typeof useForm<FormValues>>["control"];
  options?: Option[];
  error?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value} onValueChange={(v) => field.onChange(v as string)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => {
                  const o = options?.find((x) => x.id === v);
                  return o ? `${o.code} · ${o.name}` : `Pilih ${label.toLowerCase()}`;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options?.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.code} · {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
