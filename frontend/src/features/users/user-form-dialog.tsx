"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABEL, type Role, type User } from "@/lib/types";
import { useSaveUser } from "./api";

const ROLES = Object.keys(ROLE_LABEL) as Role[];

// Password wajib saat create, opsional saat edit (dicek di superRefine).
const schema = z
  .object({
    id: z.string().optional(),
    email: z.email("Email tidak valid"),
    name: z.string().min(2, "Minimal 2 karakter"),
    password: z.string().optional(),
    role: z.enum(ROLES as [Role, ...Role[]]),
  })
  .superRefine((v, ctx) => {
    const pw = v.password ?? "";
    if ((!v.id && pw.length < 8) || (v.id && pw.length > 0 && pw.length < 8)) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Minimal 8 karakter" });
    }
  });
type FormValues = z.infer<typeof schema>;

export function UserFormDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User | null;
}) {
  const save = useSaveUser();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) {
      form.reset(
        user
          ? { id: user.id, email: user.email, name: user.name, role: user.role, password: "" }
          : { email: "", name: "", role: "SALES", password: "" },
      );
    }
  }, [open, user, form]);

  const onSubmit = form.handleSubmit(({ password, ...v }) =>
    save.mutate(
      { ...v, ...(password ? { password } : {}) },
      { onSuccess: () => onOpenChange(false) },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? "Edit user" : "Tambah user"}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="name">Nama</Label>
            <Input id="name" {...form.register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password {user && "(kosongkan kalau tidak diganti)"}</Label>
            <Input id="password" type="password" {...form.register("password")} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => field.onChange(v as Role)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: Role) => ROLE_LABEL[v]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
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
