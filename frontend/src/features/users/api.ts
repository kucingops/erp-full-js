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
  password?: string;
  role: Role;
  isActive?: boolean;
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<UserInput> & { id?: string }) =>
      id
        ? api<User>(`/users/${id}`, { method: "PATCH", body })
        : api<User>("/users", { method: "POST", body }),
    onSuccess: () => {
      toast.success("User tersimpan");
      void qc.invalidateQueries({ queryKey: [USERS_KEY] });
    },
    onError: (e) => toast.error(e.message),
  });
}
