"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Account, AccountType, GeneralLedger, JournalEntry, TrialBalance } from "./types";

// Satu prefix query key untuk semua data akuntansi: jurnal baru / sync membuat GL & neraca
// saldo ikut berubah, jadi cukup invalidate ["accounting"].
export const ACCOUNTING_KEY = "accounting";
export const JOURNALS_RESOURCE = "journal-entries";

export interface AccountInput {
  code: string;
  name: string;
  type: AccountType;
  parentId?: string | null;
  isPostable?: boolean;
  isActive?: boolean;
  description?: string | null;
}

export interface JournalInput {
  date: string;
  description: string;
  lines: { accountId: string; debit: number; credit: number; description?: string }[];
}

export function useAccounts(params: { includeInactive?: boolean; postable?: boolean } = {}) {
  return useQuery({
    queryKey: [ACCOUNTING_KEY, "accounts", params],
    queryFn: () => api<Account[]>("/accounts", { query: params }),
  });
}

export function useJournal(id: string | null) {
  return useQuery({
    queryKey: [JOURNALS_RESOURCE, "detail", id],
    queryFn: () => api<JournalEntry>(`/journal-entries/${id}`),
    enabled: !!id,
  });
}

export function useGeneralLedger(accountId: string, from: string, to: string) {
  return useQuery({
    queryKey: [ACCOUNTING_KEY, "ledger", accountId, from, to],
    queryFn: () => api<GeneralLedger>("/general-ledger", { query: { accountId, from, to } }),
    enabled: !!accountId,
  });
}

export function useTrialBalance(from: string, to: string) {
  return useQuery({
    queryKey: [ACCOUNTING_KEY, "trial-balance", from, to],
    queryFn: () => api<TrialBalance>("/trial-balance", { query: { from, to } }),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: [ACCOUNTING_KEY] });
    void qc.invalidateQueries({ queryKey: [JOURNALS_RESOURCE] });
  };
}

export function useSaveAccount() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<AccountInput> & { id?: string }) =>
      id
        ? api<Account>(`/accounts/${id}`, { method: "PATCH", body })
        : api<Account>("/accounts", { method: "POST", body }),
    onSuccess: () => {
      toast.success("Akun tersimpan");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Akun dihapus");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useCreateJournal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: JournalInput) => api<JournalEntry>("/journal-entries", { method: "POST", body }),
    onSuccess: (e) => {
      toast.success(`Jurnal ${e.number} dibuat`);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useReverseJournal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api<JournalEntry>(`/journal-entries/${id}/reverse`, { method: "POST" }),
    onSuccess: (e) => {
      toast.success(`Jurnal pembalik ${e.number} dibuat`);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useSyncJournals() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      api<{ ran: boolean; posted: number; reversed: number }>("/journal-entries/sync", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(
        r.ran ? `Sinkron: ${r.posted} jurnal baru, ${r.reversed} dibalik` : "Sinkron sedang berjalan, coba lagi sebentar",
      );
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
}
