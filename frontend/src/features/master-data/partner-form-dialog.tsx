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
import { useSaveResource } from "./api";
import { FormField } from "./components";
import type { Partner } from "./types";

/**
 * Satu form untuk Customer & Supplier (field-nya sama persis).
 * Analogi OOP: satu komponen "generik" yang dikonfigurasi lewat props, bukan copy-paste.
 */
const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,30}$/, "2-30 karakter: huruf, angka, - atau _"),
  name: z.string().trim().min(2, "Minimal 2 karakter").max(150),
  email: z.union([z.literal(""), z.email("Email tidak valid")]),
  phone: z.union([z.literal(""), z.string().regex(/^[0-9+()\-\s]{6,20}$/, "Nomor tidak valid")]),
  address: z.string().max(500),
});
type FormValues = z.infer<typeof schema>;

export interface PartnerInput {
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}

export function PartnerFormDialog({
  resource,
  label,
  codePlaceholder,
  open,
  onOpenChange,
  partner,
}: {
  /** "customers" atau "suppliers" */
  resource: string;
  /** "Customer" atau "Supplier" */
  label: string;
  codePlaceholder: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner?: Partner | null;
}) {
  const save = useSaveResource<Partner, PartnerInput>(resource, label);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (!open) return;
    form.reset({
      code: partner?.code ?? "",
      name: partner?.name ?? "",
      email: partner?.email ?? "",
      phone: partner?.phone ?? "",
      address: partner?.address ?? "",
    });
  }, [open, partner, form]);

  // String kosong dikirim sebagai null = kolom dikosongkan.
  const onSubmit = form.handleSubmit((v) =>
    save.mutate(
      {
        id: partner?.id,
        code: v.code.toUpperCase(),
        name: v.name,
        email: v.email || null,
        phone: v.phone.trim() || null,
        address: v.address.trim() || null,
      },
      { onSuccess: () => onOpenChange(false) },
    ),
  );

  const lower = label.toLowerCase();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{partner ? `Edit ${lower}` : `Tambah ${lower}`}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <FormField id="code" label="Kode" error={errors.code?.message}>
              <Input
                id="code"
                className="uppercase"
                placeholder={codePlaceholder}
                {...form.register("code")}
              />
            </FormField>
            <FormField id="name" label="Nama" error={errors.name?.message}>
              <Input id="name" {...form.register("name")} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="email" label="Email (opsional)" error={errors.email?.message}>
              <Input id="email" type="email" {...form.register("email")} />
            </FormField>
            <FormField id="phone" label="Telepon (opsional)" error={errors.phone?.message}>
              <Input id="phone" type="tel" {...form.register("phone")} />
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
