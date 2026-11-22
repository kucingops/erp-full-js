"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/features/reports/report-ui";
import { useSaveAccount } from "./api";
import { ACCOUNT_TYPE_LABEL, type Account, type AccountType } from "./types";

const TYPES = Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[];

const schema = z.object({
  code: z.string().regex(/^[0-9A-Za-z.-]{1,20}$/, "Angka/huruf/titik/strip, maks 20"),
  name: z.string().min(2, "Minimal 2 karakter"),
  type: z.enum(TYPES as [AccountType, ...AccountType[]]),
  parentId: z.string(),
  isPostable: z.boolean(),
  description: z.string(),
});
type FormValues = z.infer<typeof schema>;

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account | null;
  /** semua akun, untuk pilihan induk (hanya header) */
  accounts: Account[];
}) {
  const save = useSaveAccount();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;
  const type = useWatch({ control: form.control, name: "type" });
  const locked = !!account?.isSystem;
  const used = (account?._count?.lines ?? 0) > 0;

  useEffect(() => {
    if (open) {
      form.reset(
        account
          ? {
              code: account.code,
              name: account.name,
              type: account.type,
              parentId: account.parentId ?? "",
              isPostable: account.isPostable,
              description: account.description ?? "",
            }
          : { code: "", name: "", type: "EXPENSE", parentId: "", isPostable: true, description: "" },
      );
    }
  }, [open, account, form]);

  const parents = accounts
    .filter((a) => !a.isPostable && a.type === type && a.id !== account?.id)
    .map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));

  const onSubmit = form.handleSubmit((v) =>
    save.mutate(
      {
        id: account?.id,
        name: v.name,
        description: v.description || null,
        parentId: v.parentId || null,
        // field yang dikunci backend tidak dikirim supaya tidak ditolak
        ...(!locked && !used && { code: v.code, type: v.type }),
        ...(!locked && { isPostable: v.isPostable }),
      },
      { onSuccess: () => onOpenChange(false) },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Edit akun" : "Tambah akun"}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="code">Kode</Label>
              <Input id="code" disabled={locked || used} {...form.register("code")} />
              {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
            </div>
            <div className="col-span-2 grid gap-2">
              <Label htmlFor="name">Nama</Label>
              <Input id="name" {...form.register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Tipe</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FilterSelect
                    className="w-full"
                    ariaLabel="Tipe akun"
                    value={locked || used ? (account?.type ?? field.value) : field.value}
                    onChange={(v) => {
                      field.onChange(v as AccountType);
                      form.setValue("parentId", "");
                    }}
                    options={TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABEL[t] }))}
                  />
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label>Induk</Label>
              <Controller
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <FilterSelect
                    className="w-full"
                    ariaLabel="Akun induk"
                    value={field.value}
                    onChange={field.onChange}
                    allLabel="(tanpa induk)"
                    options={parents}
                  />
                )}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={locked} {...form.register("isPostable")} />
            Bisa dijurnal (hilangkan centang untuk akun header/grup)
          </label>
          <div className="grid gap-2">
            <Label htmlFor="description">Keterangan</Label>
            <Input id="description" {...form.register("description")} />
          </div>
          {locked && (
            <p className="text-sm text-muted-foreground">
              Akun sistem dipakai jurnal otomatis: kode, tipe, dan jenisnya dikunci.
            </p>
          )}
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
