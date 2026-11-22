"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import type { PurchaseOrderDetail } from "./types";

/** Pola standar per fitur: query key, hooks query/mutation, dan invalidasi cache di satu file. */
export const PURCHASE_ORDERS_KEY = "purchase-orders";

export interface PurchaseOrderInput {
  supplierId: string;
  warehouseId: string;
  orderDate?: string;
  notes?: string;
  /** Kosong = default mata uang supplier → IDR */
  currencyCode?: string;
  /** Kosong = kurs dari tabel kurs per orderDate */
  exchangeRate?: number;
  items: { productId: string; quantity: number; unitPrice: number }[];
}

export type PurchaseOrderAction = "approve" | "receive" | "cancel";

const ACTION_MESSAGE: Record<PurchaseOrderAction, string> = {
  approve: "PO disetujui",
  receive: "Barang diterima, stok bertambah",
  cancel: "PO dibatalkan",
};

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: [PURCHASE_ORDERS_KEY, id],
    queryFn: () => api<PurchaseOrderDetail>(`/purchase-orders/${id}`),
  });
}

export function useSavePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: PurchaseOrderInput & { id?: string }) =>
      id
        ? api<PurchaseOrderDetail>(`/purchase-orders/${id}`, { method: "PATCH", body })
        : api<PurchaseOrderDetail>("/purchase-orders", { method: "POST", body }),
    onSuccess: () => {
      toast.success("Purchase order tersimpan");
      void qc.invalidateQueries({ queryKey: [PURCHASE_ORDERS_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Aksi state machine: approve / receive / cancel. */
export function usePurchaseOrderAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: PurchaseOrderAction }) =>
      api<PurchaseOrderDetail>(`/purchase-orders/${id}/${action}`, { method: "POST" }),
    onSuccess: (_data, { action }) => {
      toast.success(ACTION_MESSAGE[action]);
      void qc.invalidateQueries({ queryKey: [PURCHASE_ORDERS_KEY] });
      // stok berubah saat receive → cache inventory ikut basi
      if (action === "receive") void qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useDeletePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/purchase-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Draft PO dihapus");
      void qc.invalidateQueries({ queryKey: [PURCHASE_ORDERS_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Opsi dropdown dari master data (maks 100, cukup untuk MVP). */
export function useOptions<T>(resource: string) {
  return useQuery({
    queryKey: [resource, { page: 1, limit: 100, options: true }],
    queryFn: () => api<Paginated<T>>(`/${resource}`, { query: { page: 1, limit: 100 } }),
    select: (r) => r.data,
    staleTime: 60_000,
  });
}
