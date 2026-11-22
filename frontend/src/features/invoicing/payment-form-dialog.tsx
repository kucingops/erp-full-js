"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
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
import { formatMoney, formatRate, isForeign } from "@/features/currencies/format";
import { BASE_CURRENCY } from "@/features/currencies/types";
import { useAddPayment } from "./api";
import type { InvoiceConfig } from "./config";
import { todayInput } from "./format";
import { PAYMENT_METHOD_LABEL, type InvoiceDetail, type PaymentMethod } from "./types";

const METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];

/** Schema dibuat per invoice supaya batas maksimal = sisa tagihan (backend tetap cek ulang). */
const makeSchema = (max: number, code: string) =>
  z.object({
    amount: z.coerce
      .number<string | number>()
      .positive("Harus lebih dari 0")
      .max(max, `Maksimal sisa tagihan ${formatMoney(max, code)}`),
    // "" = pakai kurs invoice
    exchangeRate: z.union([z.literal(""), z.coerce.number<string | number>().positive("Harus > 0")]).optional(),
    paidAt: z.string().min(1, "Wajib diisi"),
    method: z.enum(METHODS as [PaymentMethod, ...PaymentMethod[]]),
    reference: z.string().max(100).optional(),
    notes: z.string().max(500).optional(),
  });
type FormInput = z.input<ReturnType<typeof makeSchema>>;
type FormValues = z.output<ReturnType<typeof makeSchema>>;

export function PaymentFormDialog({
  cfg,
  invoice,
  open,
  onOpenChange,
}: {
  cfg: InvoiceConfig;
  invoice: InvoiceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rest = Number(invoice.outstandingAmount);
  const cur = invoice.currencyCode;
  const foreign = isForeign(cur);
  const pay = useAddPayment(cfg, invoice.id);
  const form = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(makeSchema(rest, cur)) });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) {
      form.reset({ amount: rest, paidAt: todayInput(), method: "TRANSFER", exchangeRate: "", reference: "", notes: "" });
    }
  }, [open, rest, form]);

  const onSubmit = form.handleSubmit(({ reference, notes, exchangeRate, ...v }) =>
    pay.mutate(
      {
        ...v,
        ...(reference ? { reference } : {}),
        ...(notes ? { notes } : {}),
        ...(exchangeRate && foreign ? { exchangeRate } : {}),
      },
      { onSuccess: () => onOpenChange(false) },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat pembayaran</DialogTitle>
          <DialogDescription>
            {invoice.number} · sisa tagihan {formatMoney(rest, cur)}
            {foreign && ` (≈ ${formatMoney(invoice.outstandingAmountBase)})`}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="amount">Jumlah ({cur})</Label>
              <Input id="amount" type="number" step="0.01" min={0} {...form.register("amount")} />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="paidAt">Tanggal bayar</Label>
              <Input id="paidAt" type="date" {...form.register("paidAt")} />
              {errors.paidAt && <p className="text-sm text-destructive">{errors.paidAt.message}</p>}
            </div>
          </div>
          {foreign && (
            <div className="grid gap-2">
              <Label htmlFor="exchangeRate">Kurs saat bayar ke {BASE_CURRENCY} (opsional)</Label>
              <Input
                id="exchangeRate"
                type="number"
                min={0}
                step="0.000001"
                placeholder={formatRate(invoice.exchangeRate)}
                {...form.register("exchangeRate")}
              />
              <p className="text-xs text-muted-foreground">
                Kosong = kurs invoice ({formatRate(invoice.exchangeRate)}). Selisih kurs belum dibukukan.
              </p>
              {errors.exchangeRate && (
                <p className="text-sm text-destructive">{errors.exchangeRate.message}</p>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Metode</Label>
              <Controller
                control={form.control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => field.onChange(v as PaymentMethod)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: PaymentMethod) => PAYMENT_METHOD_LABEL[v]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_METHOD_LABEL[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reference">No. referensi</Label>
              <Input id="reference" placeholder="mis. TRF-BCA-001" {...form.register("reference")} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Catatan</Label>
            <Input id="notes" {...form.register("notes")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pay.isPending}>
              {pay.isPending ? "Menyimpan..." : "Simpan pembayaran"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
