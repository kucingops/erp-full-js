"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { FormField } from "@/features/master-data/components";
import { useSaveCurrency, useSaveRate } from "./api";
import { CurrencySelect } from "./components";
import type { Currency } from "./types";

const currencySchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z]{3}$/, "3 huruf ISO 4217, misal USD"),
  name: z.string().trim().min(2, "Minimal 2 karakter").max(60),
  symbol: z.string().trim().max(5),
  decimals: z.number({ error: "Wajib angka" }).int().min(0).max(4),
});
type CurrencyValues = z.infer<typeof currencySchema>;

export function CurrencyFormDialog({
  open,
  onOpenChange,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency?: Currency | null;
}) {
  const save = useSaveCurrency();
  const form = useForm<CurrencyValues>({ resolver: zodResolver(currencySchema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (!open) return;
    form.reset({
      code: currency?.code ?? "",
      name: currency?.name ?? "",
      symbol: currency?.symbol ?? "",
      decimals: currency?.decimals ?? 2,
    });
  }, [open, currency, form]);

  const onSubmit = form.handleSubmit((v) =>
    save.mutate(
      { id: currency?.id, ...v, code: v.code.toUpperCase() },
      { onSuccess: () => onOpenChange(false) },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currency ? "Edit mata uang" : "Tambah mata uang"}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <FormField id="code" label="Kode" error={errors.code?.message}>
              <Input
                id="code"
                className="uppercase"
                placeholder="USD"
                disabled={!!currency}
                {...form.register("code")}
              />
            </FormField>
            <FormField id="name" label="Nama" error={errors.name?.message}>
              <Input id="name" placeholder="US Dollar" {...form.register("name")} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="symbol" label="Simbol" error={errors.symbol?.message}>
              <Input id="symbol" placeholder="$" {...form.register("symbol")} />
            </FormField>
            <FormField id="decimals" label="Digit desimal" error={errors.decimals?.message}>
              <Input
                id="decimals"
                type="number"
                min={0}
                max={4}
                {...form.register("decimals", { valueAsNumber: true })}
              />
            </FormField>
          </div>
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

const rateSchema = z.object({
  currencyCode: z.string().length(3, "Pilih mata uang"),
  effectiveDate: z.string().min(1, "Isi tanggal"),
  rate: z.number({ error: "Wajib angka" }).positive("Harus > 0"),
});
type RateValues = z.infer<typeof rateSchema>;

/** Input kurs harian. Tanggal + mata uang yang sama = update (upsert di backend). */
export function RateFormDialog({
  open,
  onOpenChange,
  defaultCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCurrency?: string;
}) {
  const save = useSaveRate();
  const form = useForm<RateValues>({ resolver: zodResolver(rateSchema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (!open) return;
    form.reset({
      currencyCode: defaultCurrency ?? "USD",
      effectiveDate: new Date().toISOString().slice(0, 10),
      rate: undefined as unknown as number,
    });
  }, [open, defaultCurrency, form]);

  const onSubmit = form.handleSubmit((v) =>
    save.mutate(v, { onSuccess: () => onOpenChange(false) }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Input kurs</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <FormField id="rateCurrency" label="Mata uang" error={errors.currencyCode?.message}>
            <CurrencySelect
              id="rateCurrency"
              value={useWatch({ control: form.control, name: "currencyCode" })}
              onChange={(c) => form.setValue("currencyCode", c ?? "")}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="effectiveDate" label="Berlaku mulai" error={errors.effectiveDate?.message}>
              <Input id="effectiveDate" type="date" {...form.register("effectiveDate")} />
            </FormField>
            <FormField id="rate" label="1 unit = ... IDR" error={errors.rate?.message}>
              <Input
                id="rate"
                type="number"
                step="0.000001"
                min={0}
                {...form.register("rate", { valueAsNumber: true })}
              />
            </FormField>
          </div>
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
