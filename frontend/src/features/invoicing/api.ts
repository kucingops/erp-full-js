"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { InvoiceConfig } from "./config";
import type { InvoiceCandidate, InvoiceDetail, InvoiceSummary, PaymentMethod } from "./types";

// Query key = nama resource ("sales-invoices" / "purchase-bills"), sama dengan useListQuery,
// jadi satu invalidateQueries([resource]) menyegarkan list, detail, summary, dan candidates.

export interface CreateInvoiceInput {
  orderId: string;
  issueDate?: string;
  dueDate?: string;
  termDays?: number;
  notes?: string;
}

export interface PaymentInput {
  amount: number;
  paidAt?: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
}

export function useInvoice(cfg: InvoiceConfig, id: string) {
  return useQuery({
    queryKey: [cfg.resource, id],
    queryFn: () => api<InvoiceDetail>(`/${cfg.resource}/${id}`),
  });
}

export function useInvoiceSummary(cfg: InvoiceConfig) {
  return useQuery({
    queryKey: [cfg.resource, "summary"],
    queryFn: () => api<InvoiceSummary>(`/${cfg.resource}/summary`),
  });
}

export function useInvoiceCandidates(cfg: InvoiceConfig, enabled: boolean) {
  return useQuery({
    queryKey: [cfg.resource, "candidates"],
    queryFn: () => api<InvoiceCandidate[]>(`/${cfg.resource}/candidates`),
    enabled,
  });
}

export function useCreateInvoice(cfg: InvoiceConfig) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInvoiceInput) =>
      api<InvoiceDetail>(`/${cfg.resource}`, { method: "POST", body }),
    onSuccess: (inv) => {
      toast.success(`${cfg.docLabel} ${inv.number} dibuat`);
      void qc.invalidateQueries({ queryKey: [cfg.resource] });
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useDeleteInvoice(cfg: InvoiceConfig) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/${cfg.resource}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(`${cfg.docLabel} dihapus`);
      void qc.invalidateQueries({ queryKey: [cfg.resource] });
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useAddPayment(cfg: InvoiceConfig, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PaymentInput) =>
      api<InvoiceDetail>(`/${cfg.resource}/${id}/payments`, { method: "POST", body }),
    onSuccess: (inv) => {
      toast.success(inv.status === "PAID" ? `${inv.number} lunas` : "Pembayaran dicatat");
      void qc.invalidateQueries({ queryKey: [cfg.resource] });
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useDeletePayment(cfg: InvoiceConfig, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      api<InvoiceDetail>(`/${cfg.resource}/${id}/payments/${paymentId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Pembayaran dihapus");
      void qc.invalidateQueries({ queryKey: [cfg.resource] });
    },
    onError: (e) => toast.error(e.message),
  });
}
