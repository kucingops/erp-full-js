"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { WAREHOUSES_KEY, useSaveResource } from "./api";
import { FormField } from "./components";
import type { Warehouse } from "./types";

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,30}$/, "2-30 karakter: huruf, angka, - atau _"),
  name: z.string().trim().min(2, "Minimal 2 karakter").max(150),
  address: z.string().max(500),
});
type FormValues = z.infer<typeof schema>;

export interface WarehouseInput {
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
}

export function useSaveWarehouse() {
  return useSaveResource<Warehouse, WarehouseInput>(WAREHOUSES_KEY, "Gudang");
}

export function WarehouseFormDialog({
  open,
  onOpenChange,
  warehouse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouse?: Warehouse | null;
}) {
  const save = useSaveWarehouse();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (!open) return;
    form.reset({
      code: warehouse?.code ?? "",
      name: warehouse?.name ?? "",
      address: warehouse?.address ?? "",
    });
  }, [open, warehouse, form]);

  const onSubmit = form.handleSubmit((v) =>
    save.mutate(
      {
        id: warehouse?.id,
        code: v.code.toUpperCase(),
        name: v.name,
        address: v.address.trim() || null,
      },
      { onSuccess: () => onOpenChange(false) },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{warehouse ? "Edit gudang" : "Tambah gudang"}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <FormField id="code" label="Kode" error={errors.code?.message}>
              <Input id="code" className="uppercase" placeholder="WH-SBY" {...form.register("code")} />
            </FormField>
            <FormField id="name" label="Nama gudang" error={errors.name?.message}>
              <Input id="name" {...form.register("name")} />
            </FormField>
          </div>
          <FormField id="address" label="Alamat (opsional)" error={errors.address?.message}>
            <Input id="address" {...form.register("address")} />
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
