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
import { CATEGORIES_KEY, useSaveResource } from "./api";
import { FormField } from "./components";
import type { Category } from "./types";

const schema = z.object({
  name: z.string().trim().min(2, "Minimal 2 karakter").max(100),
});
type FormValues = z.infer<typeof schema>;

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
}) {
  const save = useSaveResource<Category, FormValues>(CATEGORIES_KEY, "Kategori");
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) form.reset({ name: category?.name ?? "" });
  }, [open, category, form]);

  const onSubmit = form.handleSubmit((v) =>
    save.mutate({ id: category?.id, ...v }, { onSuccess: () => onOpenChange(false) }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "Edit kategori" : "Tambah kategori"}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <FormField id="name" label="Nama kategori" error={errors.name?.message}>
            <Input id="name" {...form.register("name")} />
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
