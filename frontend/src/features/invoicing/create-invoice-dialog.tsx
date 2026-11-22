"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { MoneyWithBase } from "@/features/currencies/components";
import { formatMoney, formatRate, isForeign } from "@/features/currencies/format";
import { BASE_CURRENCY } from "@/features/currencies/types";
import { formatDate } from "@/features/sales-orders/format";
import { useCreateInvoice, useInvoiceCandidates } from "./api";
import type { InvoiceConfig } from "./config";
import { todayInput } from "./format";

const schema = z
  .object({
    orderId: z.string().min(1, "Pilih order"),
    issueDate: z.string().min(1, "Wajib diisi"),
    termDays: z.coerce.number<string | number>().int().min(0).max(365),
    dueDate: z.string().optional(),
    // "" = pakai kurs order
    exchangeRate: z.union([z.literal(""), z.coerce.number<string | number>().positive("Harus > 0")]).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((v) => !v.dueDate || v.dueDate >= v.issueDate, {
    path: ["dueDate"],
    message: "Tidak boleh sebelum tanggal invoice",
  });
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function CreateInvoiceDialog({
  cfg,
  open,
  onOpenChange,
}: {
  cfg: InvoiceConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const create = useCreateInvoice(cfg);
  const candidates = useInvoiceCandidates(cfg, open);
  const form = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;
  const options = candidates.data ?? [];
  const orderId = useWatch({ control: form.control, name: "orderId" });
  const selected = options.find((o) => o.id === orderId);

  useEffect(() => {
    if (open) form.reset({ orderId: "", issueDate: todayInput(), termDays: 30, dueDate: "", exchangeRate: "", notes: "" });
  }, [open, form]);

  const onSubmit = form.handleSubmit(({ dueDate, notes, exchangeRate, ...v }) =>
    create.mutate(
      {
        ...v,
        ...(dueDate ? { dueDate } : {}),
        ...(notes ? { notes } : {}),
        ...(exchangeRate && isForeign(selected?.currencyCode) ? { exchangeRate } : {}),
      },
      {
        onSuccess: (inv) => {
          onOpenChange(false);
          router.push(`/${cfg.resource}/${inv.id}`);
        },
      },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat {cfg.docLabel.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Nilai & mata uang tagihan = {cfg.orderLabel.toLowerCase()}. Satu order hanya bisa ditagih sekali.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label>{cfg.orderLabel}</Label>
            <Controller
              control={form.control}
              name="orderId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => field.onChange(v as string)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string) => {
                        const o = options.find((x) => x.id === v);
                        return o ? `${o.number} · ${formatMoney(o.totalAmount, o.currencyCode)}` : "Pilih order";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.number} · {(o.customer ?? o.supplier)?.name} · {formatDate(o.orderDate)} ·{" "}
                        <MoneyWithBase
                          amount={o.totalAmount}
                          currencyCode={o.currencyCode}
                          baseAmount={o.totalAmountBase}
                        />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {!candidates.isLoading && options.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Tidak ada {cfg.orderLabel.toLowerCase()} yang siap ditagih.
              </p>
            )}
            {errors.orderId && <p className="text-sm text-destructive">{errors.orderId.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="issueDate">Tanggal {cfg.docLabel.toLowerCase()}</Label>
              <Input id="issueDate" type="date" {...form.register("issueDate")} />
              {errors.issueDate && <p className="text-sm text-destructive">{errors.issueDate.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="termDays">Termin (hari)</Label>
              <Input id="termDays" type="number" min={0} max={365} {...form.register("termDays")} />
            </div>
          </div>
          {selected && isForeign(selected.currencyCode) && (
            <div className="grid gap-2">
              <Label htmlFor="exchangeRate">
                Kurs {selected.currencyCode} ke {BASE_CURRENCY} (opsional)
              </Label>
              <Input
                id="exchangeRate"
                type="number"
                min={0}
                step="0.000001"
                placeholder={formatRate(selected.exchangeRate)}
                {...form.register("exchangeRate")}
              />
              <p className="text-xs text-muted-foreground">
                Kosong = kurs order ({formatRate(selected.exchangeRate)}).
              </p>
              {errors.exchangeRate && (
                <p className="text-sm text-destructive">{errors.exchangeRate.message}</p>
              )}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="dueDate">Jatuh tempo (opsional, menimpa termin)</Label>
            <Input id="dueDate" type="date" {...form.register("dueDate")} />
            {errors.dueDate && <p className="text-sm text-destructive">{errors.dueDate.message}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Catatan</Label>
            <Input id="notes" {...form.register("notes")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Menyimpan..." : "Buat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
