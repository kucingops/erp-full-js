"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import type { User } from "@/lib/types";
import { useResetPassword, useSetUserActive } from "./api";

const resetSchema = z
  .object({
    password: z.string().min(8, "Minimal 8 karakter"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Password tidak sama" });
type ResetValues = z.infer<typeof resetSchema>;

/** Admin set password baru untuk user lain. Semua sesi user itu dicabut. */
export function ResetPasswordDialog({
  user,
  onOpenChange,
}: {
  user: User | null;
  onOpenChange: (open: boolean) => void;
}) {
  const reset = useResetPassword();
  const form = useForm<ResetValues>({ resolver: zodResolver(resetSchema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (user) form.reset({ password: "", confirm: "" });
  }, [user, form]);

  const onSubmit = form.handleSubmit(({ password }) => {
    if (!user) return;
    reset.mutate({ id: user.id, password }, { onSuccess: () => onOpenChange(false) });
  });

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Password baru untuk <b>{user?.name}</b> ({user?.email}). Semua sesi login user ini
            akan dicabut.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="new-password">Password baru</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Ulangi password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              {...form.register("confirm")}
            />
            {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={reset.isPending}>
              {reset.isPending ? "Menyimpan..." : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Konfirmasi aktif/nonaktif. */
export function ToggleActiveDialog({
  user,
  onOpenChange,
}: {
  user: User | null;
  onOpenChange: (open: boolean) => void;
}) {
  const setActive = useSetUserActive();
  const deactivating = !!user?.isActive;
  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {deactivating ? "Nonaktifkan" : "Aktifkan"} {user?.name}?
          </DialogTitle>
          <DialogDescription>
            {deactivating
              ? "User tidak bisa login lagi dan semua sesinya dicabut. Data transaksinya tetap ada."
              : "User bisa login lagi dengan password yang sama."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            variant={deactivating ? "destructive" : "default"}
            disabled={setActive.isPending}
            onClick={() =>
              user &&
              setActive.mutate(
                { id: user.id, active: !user.isActive },
                { onSettled: () => onOpenChange(false) },
              )
            }
          >
            {setActive.isPending ? "Memproses..." : deactivating ? "Nonaktifkan" : "Aktifkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
