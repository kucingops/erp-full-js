"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Query key list audit log (dipakai juga untuk invalidasi dari fitur lain). */
export const AUDIT_KEY = "audit-logs";

/** Daftar entity yang di-audit, untuk dropdown filter. */
export function useAuditEntities() {
  return useQuery({
    queryKey: [AUDIT_KEY, "entities"],
    queryFn: () => api<string[]>(`/${AUDIT_KEY}/entities`),
    staleTime: Infinity,
  });
}
