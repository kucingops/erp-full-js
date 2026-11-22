"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiBlob } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import type { ExportFormat } from "./types";

type Params = Record<string, string | undefined>;

/** Query laporan (JSON). Key = [endpoint, filter] supaya cache per filter. */
export function useReport<T>(endpoint: string, params: Params, enabled = true) {
  return useQuery({
    queryKey: ["reports", endpoint, params],
    queryFn: () => api<T>(endpoint, { query: params }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/**
 * Download file export. Nama file dibuat di FE (header Content-Disposition
 * tidak terbaca lintas origin tanpa expose header CORS).
 */
export function useExportReport(endpoint: string, filename: string) {
  return useMutation({
    mutationFn: async ({ format, params }: { format: ExportFormat; params: Params }) => {
      const blob = await apiBlob(`${endpoint}/export`, { query: { ...params, format } });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(e.message),
  });
}

export interface Option {
  value: string;
  label: string;
}

/** Opsi dropdown filter dari endpoint master data (customers, suppliers, categories, warehouses). */
export function useOptions(resource: string, enabled = true) {
  return useQuery({
    queryKey: [resource, "report-options"],
    queryFn: () =>
      api<Paginated<{ id: string; name: string; code?: string }>>(`/${resource}`, {
        query: { limit: 100, sortBy: "name", sortOrder: "asc" },
      }),
    select: (r): Option[] =>
      r.data.map((x) => ({ value: x.id, label: x.code ? `${x.code} - ${x.name}` : x.name })),
    staleTime: 5 * 60_000,
    enabled,
  });
}
