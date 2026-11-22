"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";

/** Query key = nama resource di URL backend (/api/<resource>). */
export const PRODUCTS_KEY = "products";
export const CATEGORIES_KEY = "categories";
export const CUSTOMERS_KEY = "customers";
export const SUPPLIERS_KEY = "suppliers";
export const WAREHOUSES_KEY = "warehouses";

/**
 * Hook simpan generik: POST kalau tanpa id, PATCH kalau ada id.
 * Semua master data punya pola CRUD yang sama, jadi cukup satu hook (bandingkan useSaveUser).
 */
export function useSaveResource<T, I extends object>(resource: string, label: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<I> & { id?: string }) =>
      id
        ? api<T>(`/${resource}/${id}`, { method: "PATCH", body })
        : api<T>(`/${resource}`, { method: "POST", body }),
    onSuccess: () => {
      toast.success(`${label} tersimpan`);
      void qc.invalidateQueries({ queryKey: [resource] });
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useDeleteResource(resource: string, label: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/${resource}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(`${label} dihapus`);
      void qc.invalidateQueries({ queryKey: [resource] });
    },
    // 409 = masih dipakai di stok/transaksi: sarankan nonaktifkan.
    onError: (e) =>
      toast.error(
        e instanceof ApiError && e.status === 409
          ? `${label} masih dipakai, nonaktifkan saja sebagai gantinya`
          : e.message,
      ),
  });
}
