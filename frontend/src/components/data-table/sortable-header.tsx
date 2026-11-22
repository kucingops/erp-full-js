"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SortState {
  sortBy: string;
  sortOrder: "asc" | "desc";
}

/**
 * State sort server-side. Klik kolom yang sama: asc <-> desc.
 * Klik kolom lain: mulai dari asc.
 */
export function useSort(initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);
  const toggle = (field: string) =>
    setSort((s) =>
      s.sortBy === field
        ? { sortBy: field, sortOrder: s.sortOrder === "asc" ? "desc" : "asc" }
        : { sortBy: field, sortOrder: "asc" },
    );
  return { sort, toggle };
}

/**
 * Header kolom yang bisa diklik untuk sort (server-side).
 * `field` harus ada di whitelist SORTABLE backend.
 * @example { accessorKey: "name", header: () => <SortableHeader label="Nama" field="name" sort={sort} onSort={toggle} /> }
 */
export function SortableHeader({
  label,
  field,
  sort,
  onSort,
  className,
}: {
  label: string;
  field: string;
  sort: SortState;
  onSort: (field: string) => void;
  className?: string;
}) {
  const active = sort.sortBy === field;
  const Icon = !active ? ArrowUpDown : sort.sortOrder === "asc" ? ArrowUp : ArrowDown;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-ml-2.5", className)}
      onClick={() => onSort(field)}
      aria-label={`Urutkan berdasarkan ${label}`}
    >
      {label}
      <Icon className={active ? undefined : "text-muted-foreground/60"} />
    </Button>
  );
}
