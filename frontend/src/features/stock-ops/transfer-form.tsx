"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
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
import { useCreateStockTransfer, useOptions, type Option } from "./api";

const schema = z
  .object({
    fromWarehouseId: z.string().min(1, "Pilih gudang asal"),
    toWarehouseId: z.string().min(1, "Pilih gudang tujuan"),
    transferDate: z.string().min(1, "Isi tanggal"),
    notes: z.string().max(500).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1, "Pilih produk"),
          quantity: z.number({ error: "Wajib angka" }).int("Bilangan bulat").min(1, "Minimal 1"),
        }),
      )
      .min(1, "Minimal 1 item")
      .refine(
        (items) => new Set(items.map((i) => i.productId)).size === items.length,
        "Produk yang sama tidak boleh dua kali",
      ),
  })
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: "Gudang tujuan harus beda dengan gudang asal",
    path: ["toWarehouseId"],
  });
type FormValues = z.infer<typeof schema>;

const today = () => new Date().toISOString().slice(0, 10);

/** Form buat draft transfer. Stok belum berubah sampai tombol "Kirim" di halaman detail. */
export function StockTransferForm() {
  const router = useRouter();
  const create = useCreateStockTransfer();
  const warehouses = useOptions("warehouses");
  const products = useOptions("products");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fromWarehouseId: "",
      toWarehouseId: "",
      transferDate: today(),
      notes: "",
      items: [{ productId: "", quantity: 1 }],
    },
  });
  const { errors } = form.formState;
  const items = useFieldArray({ control: form.control, name: "items" });

  const onSubmit = form.handleSubmit((v) =>
    create.mutate(v, { onSuccess: (t) => router.push(`/stock-transfers/${t.id}`) }),
  );

  const productLabel = (id: string) => {
    const p = products.data?.find((x) => x.id === id);
    return p ? `${p.sku} · ${p.name}` : "Pilih produk";
  };

  return (
    <form className="grid gap-6" onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Informasi transfer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <WarehouseSelect
            label="Gudang asal"
            name="fromWarehouseId"
            control={form.control}
            options={warehouses.data}
            error={errors.fromWarehouseId?.message}
          />
          <WarehouseSelect
            label="Gudang tujuan"
            name="toWarehouseId"
            control={form.control}
            options={warehouses.data}
            error={errors.toWarehouseId?.message}
          />
          <div className="grid gap-2">
            <Label htmlFor="transferDate">Tanggal</Label>
            <Input id="transferDate" type="date" {...form.register("transferDate")} />
            {errors.transferDate && (
              <p className="text-sm text-destructive">{errors.transferDate.message}</p>
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
            onClick={() => items.append({ productId: "", quantity: 1 })}
          >
            <Plus /> Tambah item
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60%]">Produk</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.fields.map((field, index) => {
                const rowErr = errors.items?.[index];
                return (
                  <TableRow key={field.id}>
                    <TableCell className="align-top">
                      <Controller
                        control={form.control}
                        name={`items.${index}.productId`}
                        render={({ field: f }) => (
                          <Select value={f.value} onValueChange={(v) => f.onChange(v as string)}>
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
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Batal
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Menyimpan..." : "Simpan draft"}
        </Button>
      </div>
    </form>
  );
}

function WarehouseSelect({
  label,
  name,
  control,
  options,
  error,
}: {
  label: string;
  name: "fromWarehouseId" | "toWarehouseId";
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
