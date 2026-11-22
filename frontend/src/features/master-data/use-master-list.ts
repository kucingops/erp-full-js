"use client";

import { useState } from "react";
import { useSort, type SortState } from "@/components/data-table/sortable-header";
import { useDebounce } from "@/hooks/use-debounce";
import { useListQuery } from "@/hooks/use-list-query";
import { useAuthStore } from "@/lib/auth-store";
import { canAccess } from "@/lib/navigation";
import type { ListParams, Role } from "@/lib/types";

export type ActiveFilter = "all" | "active" | "inactive";

/**
 * State standar halaman list master data: page, search (debounce), sort, filter status.
 * Ganti search/sort/filter otomatis balik ke halaman 1.
 */
export function useMasterList<T>(resource: string, defaultSort: SortState, extra: ListParams = {}) {
  const [page, setPage] = useState(1);
  const [search, setSearchRaw] = useState("");
  const [active, setActiveRaw] = useState<ActiveFilter>("all");
  const debouncedSearch = useDebounce(search);
  const { sort, toggle } = useSort(defaultSort);

  const query = useListQuery<T>(resource, {
    page,
    limit: 10,
    search: debouncedSearch,
    ...sort,
    isActive: active === "all" ? undefined : active === "active",
    ...extra,
  });

  return {
    query,
    setPage,
    search,
    setSearch: (v: string) => {
      setSearchRaw(v);
      setPage(1);
    },
    active,
    setActive: (v: ActiveFilter) => {
      setActiveRaw(v);
      setPage(1);
    },
    sort,
    toggleSort: (field: string) => {
      toggle(field);
      setPage(1);
    },
  };
}

/** Apakah user login boleh create/edit/delete (samakan dengan @Roles() backend). */
export function useCanWrite(roles: Role[]) {
  const role = useAuthStore((s) => s.user?.role);
  return canAccess(role, roles);
}
