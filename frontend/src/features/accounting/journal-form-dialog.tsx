"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/features/reports/report-ui";
import { todayInput } from "@/features/invoicing/format";
import { cn } from "@/lib/utils";
import { formatAmount } from "./accounting-ui";
import { useAccounts, useCreateJournal } from "./api";

const line = z.object({
  accountId: z.string().min(1, "Pilih akun"),
  debit: z.number().min(0),
  credit: z.number().min(0),
  description: z.string(),
});
const schema = z
  .object({
    date: z.string().min(1, "Wajib diisi"),
    description: z.string().min(3, "Minimal 3 karakter"),
    lines: z.array(line).min(2, "Minimal 2 baris"),
  })
  .superRefine((v, ctx) => {
    v.lines.forEach((l, i) => {
      if ((l.debit > 0) === (l.credit > 0)) {
        ctx.addIssue({ code: "custom", path: ["lines", i, "debit"], message: "Isi debit ATAU kredit" });
      }
    });
    const d = v.lines.reduce((s, l) => s + l.debit, 0);
    const c = v.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.round(d * 100) !== Math.round(c * 100)) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Total debit harus sama dengan total kredit" });
    }
  });
type FormValues = z.infer<typeof schema>;

const emptyLine = { accountId: "", debit: 0, credit: 0, description: "" };

/** Jurnal umum (manual): baris dinamis, total D/K dihitung live. */
export function JournalFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateJournal();
  const accounts = useAccounts({ postable: true });
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const { errors } = form.formState;
  const watched = useWatch({ control: form.control, name: "lines" }) ?? [];
  const totalDebit = watched.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = watched.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = totalDebit > 0 && Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  useEffect(() => {
    if (open) form.reset({ date: todayInput(), description: "", lines: [emptyLine, emptyLine] });
  }, [open, form]);

  const options = (accounts.data ?? []).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
  const onSubmit = form.handleSubmit((v) =>
    create.mutate(
      {
        ...v,
        lines: v.lines.map((l) => ({ ...l, description: l.description || undefined })),
      },
      { onSuccess: () => onOpenChange(false) },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Jurnal umum</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-[10rem_1fr] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="date">Tanggal</Label>
              <Input id="date" type="date" {...form.register("date")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Keterangan</Label>
              <Input id="description" placeholder="mis. Bayar sewa gudang November" {...form.register("description")} />
              {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="grid grid-cols-[1fr_8rem_8rem_2rem] gap-2 text-xs font-medium text-muted-foreground">
              <span>Akun</span>
              <span className="text-right">Debit</span>
              <span className="text-right">Kredit</span>
              <span />
            </div>
            {lines.fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_8rem_8rem_2rem] items-start gap-2">
                <div className="grid gap-1">
                  <Controller
                    control={form.control}
                    name={`lines.${i}.accountId`}
                    render={({ field }) => (
                      <FilterSelect
                        className="w-full"
                        ariaLabel={`Akun baris ${i + 1}`}
                        value={field.value}
                        onChange={field.onChange}
                        options={options}
                      />
                    )}
                  />
                  <Input placeholder="Keterangan baris (opsional)" {...form.register(`lines.${i}.description`)} />
                  {errors.lines?.[i]?.accountId && (
                    <p className="text-xs text-destructive">{errors.lines[i]?.accountId?.message}</p>
                  )}
                  {errors.lines?.[i]?.debit && (
                    <p className="text-xs text-destructive">{errors.lines[i]?.debit?.message}</p>
                  )}
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  className="text-right"
                  aria-label={`Debit baris ${i + 1}`}
                  {...form.register(`lines.${i}.debit`, { valueAsNumber: true })}
                />
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  className="text-right"
                  aria-label={`Kredit baris ${i + 1}`}
                  {...form.register(`lines.${i}.credit`, { valueAsNumber: true })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Hapus baris"
                  disabled={lines.fields.length <= 2}
                  onClick={() => lines.remove(i)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_8rem_8rem_2rem] gap-2 border-t pt-2 text-sm font-medium">
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => lines.append(emptyLine)}>
                <Plus /> Tambah baris
              </Button>
              <span className="text-right tabular-nums">{formatAmount(totalDebit)}</span>
              <span className="text-right tabular-nums">{formatAmount(totalCredit)}</span>
              <span />
            </div>
            <p className={cn("text-sm", balanced ? "text-muted-foreground" : "text-destructive")}>
              {balanced ? "Seimbang" : `Selisih ${formatAmount(totalDebit - totalCredit)}`}
            </p>
            {errors.lines?.root && <p className="text-sm text-destructive">{errors.lines.root.message}</p>}
            {errors.lines?.message && <p className="text-sm text-destructive">{errors.lines.message}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={create.isPending || !balanced}>
              {create.isPending ? "Menyimpan..." : "Posting jurnal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
