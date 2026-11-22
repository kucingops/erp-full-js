"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import type { ProductRef, StockMovement, WarehouseRef } from "./types";

/** Query key = path resource (dipakai useListQuery). */
export const STOCKS_KEY = "inventory/stocks";
export const MOVEMENTS_KEY = "inventory/movements";

export interface AdjustmentInput {
  productId: string;
  warehouseId: string;
  /** Selisih: positif tambah, negatif kurangi */
  quantity: number;
  note: string;
}

export function useCreateAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdjustmentInput) =>
      api<StockMovement>("/inventory/adjustments", { method: "POST", body }),
    onSuccess: (m) => {
      toast.success(`Stok disesuaikan, saldo sekarang ${m.balanceAfter}`);
      void qc.invalidateQueries({ queryKey: [STOCKS_KEY] });
      void qc.invalidateQueries({ queryKey: [MOVEMENTS_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Daftar gudang aktif untuk filter/dropdown (endpoint milik modul master data). */
export function useWarehouseOptions() {
  return useQuery({
    queryKey: ["warehouses", "options"],
    queryFn: () =>
      api<Paginated<WarehouseRef & { isActive?: boolean }>>("/warehouses", {
        query: { limit: 100, sortBy: "name", sortOrder: "asc" },
      }),
    select: (r) => r.data.filter((w) => w.isActive !== false),
    staleTime: 5 * 60_000,
  });
}

/** Cari produk untuk dropdown (endpoint milik modul master data). */
export function useProductOptions(search: string) {
  return useQuery({
    queryKey: ["products", "options", search],
    queryFn: () =>
      api<Paginated<ProductRef & { isActive?: boolean }>>("/products", {
        query: { limit: 20, search, sortBy: "name", sortOrder: "asc" },
      }),
    select: (r) => r.data.filter((p) => p.isActive !== false),
  });
}
