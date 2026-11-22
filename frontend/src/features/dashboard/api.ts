"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DashboardSummary, LowStockItem, TrendPoint } from "./types";

/**
 * Query dashboard. Semua key diawali "dashboard" supaya modul lain (PO/SO/inventory)
 * cukup `invalidateQueries({ queryKey: [DASHBOARD_KEY] })` setelah transaksi.
 */
export const DASHBOARD_KEY = "dashboard";

/** Data dashboard tidak perlu realtime: anggap segar 1 menit. */
const STALE = 60_000;

export function useDashboardSummary() {
  return useQuery({
    queryKey: [DASHBOARD_KEY, "summary"],
    queryFn: () => api<DashboardSummary>("/dashboard/summary"),
    staleTime: STALE,
  });
}

export function useDashboardTrend(months: number) {
  return useQuery({
    queryKey: [DASHBOARD_KEY, "trend", months],
    queryFn: () => api<TrendPoint[]>("/dashboard/trend", { query: { months } }),
    staleTime: STALE,
  });
}

export function useLowStock(limit = 5) {
  return useQuery({
    queryKey: [DASHBOARD_KEY, "low-stock", limit],
    queryFn: () => api<LowStockItem[]>("/dashboard/low-stock", { query: { limit } }),
    staleTime: STALE,
  });
}
