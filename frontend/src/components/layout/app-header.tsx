"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { ROLE_LABEL } from "@/lib/types";

export function AppHeader() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, refreshToken, clear } = useAuthStore();

  async function logout() {
    if (refreshToken) {
      await api("/auth/logout", { method: "POST", body: { refreshToken }, auth: false }).catch(() => {});
    }
    clear();
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <header className="flex h-14 items-center justify-end gap-3 border-b px-4">
      {user && (
        <>
          <div className="text-right text-sm leading-tight">
            <p className="font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
        </>
      )}
      <Button variant="ghost" size="icon" onClick={logout} aria-label="Logout">
        <LogOut />
      </Button>
    </header>
  );
}
