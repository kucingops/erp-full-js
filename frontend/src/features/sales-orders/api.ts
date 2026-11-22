"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import type { SalesOrderDetail } from "./types";

/** Pola standar per fitur: query key, hooks query/mutation, dan invalidasi cache di satu file. */
export const SALES_ORDERS_KEY = "sales-orders";

export interface SalesOrderInput {
  customerId: string;
  warehouseId: string;
  orderDate?: string;
  notes?: string;
  /** Kosong = default mata uang customer → IDR */
  currencyCode?: string;
  /** Kosong = kurs dari tabel kurs per orderDate */
  exchangeRate?: number;
  items: { productId: string; quantity: number; unitPrice: number }[];
}

export type SalesOrderAction = "confirm" | "ship" | "cancel";

const ACTION_MESSAGE: Record<SalesOrderAction, string> = {
  confirm: "SO dikonfirmasi",
  ship: "Barang dikirim, stok berkurang",
  cancel: "SO dibatalkan",
};

export function useSalesOrder(id: string) {
  return useQuery({
    queryKey: [SALES_ORDERS_KEY, id],
    queryFn: () => api<SalesOrderDetail>(`/sales-orders/${id}`),
  });
}

export function useSaveSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: SalesOrderInput & { id?: string }) =>
      id
        ? api<SalesOrderDetail>(`/sales-orders/${id}`, { method: "PATCH", body })
        : api<SalesOrderDetail>("/sales-orders", { method: "POST", body }),
    onSuccess: () => {
      toast.success("Sales order tersimpan");
      void qc.invalidateQueries({ queryKey: [SALES_ORDERS_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Aksi state machine: confirm / ship / cancel. */
export function useSalesOrderAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: SalesOrderAction }) =>
      api<SalesOrderDetail>(`/sales-orders/${id}/${action}`, { method: "POST" }),
    onSuccess: (_data, { action }) => {
      toast.success(ACTION_MESSAGE[action]);
      void qc.invalidateQueries({ queryKey: [SALES_ORDERS_KEY] });
      // stok berubah saat ship → cache inventory ikut basi
      if (action === "ship") void qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useDeleteSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/sales-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Draft SO dihapus");
      void qc.invalidateQueries({ queryKey: [SALES_ORDERS_KEY] });
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
