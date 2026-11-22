"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActiveFilter } from "./use-master-list";

/** Label + input + pesan error, supaya form tidak berulang-ulang. */
export function FormField({
  id,
  label,
  error,
  children,
}: {
  id?: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

const ACTIVE_LABEL: Record<ActiveFilter, string> = {
  all: "Semua status",
  active: "Aktif",
  inactive: "Nonaktif",
};

export function ActiveFilterSelect({
  value,
  onChange,
}: {
  value: ActiveFilter;
  onChange: (v: ActiveFilter) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ActiveFilter)}>
      <SelectTrigger className="w-36" aria-label="Filter status">
        <SelectValue>{(v: ActiveFilter) => ACTIVE_LABEL[v]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(ACTIVE_LABEL) as ActiveFilter[]).map((k) => (
          <SelectItem key={k} value={k}>
            {ACTIVE_LABEL[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Badge status; kalau `onToggle` ada (user boleh tulis), badge bisa diklik untuk aktif/nonaktif. */
export function StatusCell({ active, onToggle }: { active: boolean; onToggle?: () => void }) {
  const badge = (
    <Badge variant={active ? "default" : "outline"}>{active ? "Aktif" : "Nonaktif"}</Badge>
  );
  if (!onToggle) return badge;
  return (
    <Button variant="ghost" size="xs" onClick={onToggle} aria-label="Ubah status">
      {badge}
    </Button>
  );
}

/** Tombol edit + hapus (dengan dialog konfirmasi) di kolom aksi. */
export function RowActions({
  name,
  onEdit,
  onDelete,
  deleting,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => Promise<unknown>;
  deleting?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const close = () => setConfirm(false);
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={onEdit}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Hapus" onClick={() => setConfirm(true)}>
        <Trash2 className="text-destructive" />
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus {name}?</DialogTitle>
            <DialogDescription>
              Data yang sudah dipakai di stok atau transaksi tidak bisa dihapus. Nonaktifkan saja
              kalau sudah tidak dipakai.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => onDelete().then(close, close)}
            >
              {deleting ? "Menghapus..." : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
