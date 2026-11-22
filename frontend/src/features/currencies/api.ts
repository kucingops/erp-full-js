"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import type { ConvertResult, Currency, ExchangeRate } from "./types";

export const CURRENCIES_KEY = "currencies";
export const EXCHANGE_RATES_KEY = "exchange-rates";

export interface CurrencyInput {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  isActive: boolean;
}

export interface ExchangeRateInput {
  currencyCode: string;
  effectiveDate: string;
  rate: number;
}

/** Semua mata uang aktif untuk dropdown (sedikit, cukup 100). */
export function useCurrencyOptions() {
  return useQuery({
    queryKey: [CURRENCIES_KEY, "options"],
    queryFn: () =>
      api<Paginated<Currency>>("/currencies", {
        query: { limit: 100, isActive: true, sortBy: "code", sortOrder: "asc" },
      }),
    select: (r) => r.data,
    staleTime: 5 * 60_000,
  });
}

/**
 * Kurs yang berlaku untuk `code` di `date` (preview di form PO/SO).
 * Pakai endpoint convert dengan amount 1. Base currency tidak perlu request.
 */
export function useRateFor(code: string | undefined, date: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [EXCHANGE_RATES_KEY, "convert", code, date],
    queryFn: () =>
      api<ConvertResult>("/exchange-rates/convert", { query: { amount: 1, from: code, date } }),
    enabled: enabled && !!code && code !== "IDR" && !!date,
    retry: false,
  });
}

export function useSaveCurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, code, ...rest }: Partial<CurrencyInput> & { id?: string }) =>
      id
        ? api<Currency>(`/currencies/${id}`, { method: "PATCH", body: rest })
        : api<Currency>("/currencies", { method: "POST", body: { code, ...rest } }),
    onSuccess: () => {
      toast.success("Mata uang tersimpan");
      void qc.invalidateQueries({ queryKey: [CURRENCIES_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useDeleteCurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/currencies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Mata uang dihapus");
      void qc.invalidateQueries({ queryKey: [CURRENCIES_KEY] });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError && e.status === 409
          ? "Mata uang masih dipakai, nonaktifkan saja"
          : e.message,
      ),
  });
}

/** POST = upsert per (mata uang, tanggal). */
export function useSaveRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ExchangeRateInput) =>
      api<ExchangeRate>("/exchange-rates", { method: "POST", body }),
    onSuccess: () => {
      toast.success("Kurs tersimpan");
      void qc.invalidateQueries({ queryKey: [EXCHANGE_RATES_KEY] });
      void qc.invalidateQueries({ queryKey: [CURRENCIES_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useDeleteRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/exchange-rates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Kurs dihapus");
      void qc.invalidateQueries({ queryKey: [EXCHANGE_RATES_KEY] });
      void qc.invalidateQueries({ queryKey: [CURRENCIES_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}
