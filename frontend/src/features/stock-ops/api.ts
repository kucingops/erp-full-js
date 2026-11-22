"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import type { StockOpnameDetail, StockTransferDetail } from "./types";

export const STOCK_TRANSFERS_KEY = "stock-transfers";
export const STOCK_OPNAMES_KEY = "stock-opnames";

/** Stok berubah ⇒ cache halaman inventory (stok & kartu stok) ikut basi. */
const invalidateInventory = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ["inventory/stocks"] });
  void qc.invalidateQueries({ queryKey: ["inventory/movements"] });
};

// ---------- transfer ----------

export interface StockTransferInput {
  fromWarehouseId: string;
  toWarehouseId: string;
  transferDate?: string;
  notes?: string;
  items: { productId: string; quantity: number }[];
}

export type StockTransferAction = "send" | "receive" | "cancel";

const TRANSFER_MESSAGE: Record<StockTransferAction, string> = {
  send: "Transfer dikirim, stok gudang asal berkurang",
  receive: "Transfer diterima, stok gudang tujuan bertambah",
  cancel: "Transfer dibatalkan",
};

export function useStockTransfer(id: string) {
  return useQuery({
    queryKey: [STOCK_TRANSFERS_KEY, id],
    queryFn: () => api<StockTransferDetail>(`/stock-transfers/${id}`),
  });
}

export function useCreateStockTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StockTransferInput) =>
      api<StockTransferDetail>("/stock-transfers", { method: "POST", body }),
    onSuccess: () => {
      toast.success("Draft transfer tersimpan");
      void qc.invalidateQueries({ queryKey: [STOCK_TRANSFERS_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Aksi state machine. `receive` boleh bawa qty diterima per produk. */
export function useStockTransferAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      items,
    }: {
      id: string;
      action: StockTransferAction;
      items?: { productId: string; receivedQuantity: number }[];
    }) =>
      api<StockTransferDetail>(`/stock-transfers/${id}/${action}`, {
        method: "POST",
        body: action === "receive" ? { items } : undefined,
      }),
    onSuccess: (_d, { action }) => {
      toast.success(TRANSFER_MESSAGE[action]);
      void qc.invalidateQueries({ queryKey: [STOCK_TRANSFERS_KEY] });
      invalidateInventory(qc);
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useDeleteStockTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/stock-transfers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Draft transfer dihapus");
      void qc.invalidateQueries({ queryKey: [STOCK_TRANSFERS_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}

// ---------- opname ----------

export interface StockOpnameInput {
  warehouseId: string;
  categoryId?: string;
  productIds?: string[];
  notes?: string;
}

export function useStockOpname(id: string) {
  return useQuery({
    queryKey: [STOCK_OPNAMES_KEY, id],
    queryFn: () => api<StockOpnameDetail>(`/stock-opnames/${id}`),
  });
}

export function useCreateStockOpname() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StockOpnameInput) =>
      api<StockOpnameDetail>("/stock-opnames", { method: "POST", body }),
    onSuccess: (o) => {
      toast.success(`Lembar hitung dibuat (${o.lines.length} produk)`);
      void qc.invalidateQueries({ queryKey: [STOCK_OPNAMES_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Simpan hasil hitung (counted qty) + catatan. */
export function useSaveOpnameCounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      notes?: string;
      lines: { productId: string; countedQty: number | null }[];
    }) => api<StockOpnameDetail>(`/stock-opnames/${id}`, { method: "PATCH", body }),
    onSuccess: (o) => {
      toast.success("Hasil hitung tersimpan");
      qc.setQueryData([STOCK_OPNAMES_KEY, o.id], o);
      void qc.invalidateQueries({ queryKey: [STOCK_OPNAMES_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}

export type StockOpnameAction = "post" | "cancel";

export function useStockOpnameAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: StockOpnameAction }) =>
      api<StockOpnameDetail>(`/stock-opnames/${id}/${action}`, { method: "POST" }),
    onSuccess: (_d, { action }) => {
      toast.success(action === "post" ? "Opname diposting, selisih dibukukan" : "Opname dibatalkan");
      void qc.invalidateQueries({ queryKey: [STOCK_OPNAMES_KEY] });
      if (action === "post") invalidateInventory(qc);
    },
    onError: (e) => toast.error(e.message),
  });
}

// ---------- dropdown ----------

export interface Option {
  id: string;
  name: string;
  code?: string;
  sku?: string;
  unit?: string;
  isActive?: boolean;
}

/** Opsi dropdown dari master data (maks 100 aktif, cukup untuk MVP). */
export function useOptions(resource: "warehouses" | "products" | "categories") {
  return useQuery({
    queryKey: [resource, { page: 1, limit: 100, options: true }],
    queryFn: () => api<Paginated<Option>>(`/${resource}`, { query: { page: 1, limit: 100 } }),
    select: (r) => r.data.filter((o) => o.isActive !== false),
    staleTime: 60_000,
  });
}
