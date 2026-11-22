"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/lib/auth-store";
import { canAccess, NAV } from "@/lib/navigation";

/** Redirect ke /login kalau belum login, dan tolak halaman yang role-nya tidak cocok. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { hydrated, accessToken, user } = useAuthStore();

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const item = NAV.flatMap((g) => g.items).find(
    (i) => i.href !== "/" && pathname.startsWith(i.href),
  );
  if (item && !canAccess(user?.role, item.roles)) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold">403: Akses ditolak</h1>
        <p className="text-sm text-muted-foreground">Role kamu tidak punya akses ke halaman ini.</p>
      </div>
    );
  }

  return <>{children}</>;
}
