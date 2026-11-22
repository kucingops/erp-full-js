"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Role, User } from "@/lib/types";

/** Pola standar per fitur: query key, hooks mutation, dan invalidasi cache di satu file. */
export const USERS_KEY = "users";

export interface UserInput {
  email: string;
  name: string;
  /** Hanya saat create. Ganti password lewat useResetPassword. */
  password?: string;
  role: Role;
}

function useInvalidateUsers() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: [USERS_KEY] });
    // Aksi user ikut tercatat di audit log.
    void qc.invalidateQueries({ queryKey: ["audit-logs"] });
  };
}

export function useSaveUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, password, ...body }: Partial<UserInput> & { id?: string }) =>
      id
        ? api<User>(`/users/${id}`, { method: "PATCH", body })
        : api<User>("/users", { method: "POST", body: { ...body, password } }),
    onSuccess: () => {
      toast.success("User tersimpan");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
}

/** Aktifkan / nonaktifkan. Nonaktif = tidak bisa login + semua sesi dicabut. */
export function useSetUserActive() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api<User>(`/users/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" }),
    onSuccess: (u) => {
      toast.success(u.isActive ? "User diaktifkan" : "User dinonaktifkan");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useResetPassword() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api<User>(`/users/${id}/reset-password`, { method: "POST", body: { password } }),
    onSuccess: () => {
      toast.success("Password direset, user harus login ulang");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
}
