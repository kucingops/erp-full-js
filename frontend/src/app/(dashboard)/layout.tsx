import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AuthGuard } from "@/components/layout/auth-guard";

/**
 * Sidebar & AuthGuard membaca usePathname(). Dengan cacheComponents, di route dinamik
 * (mis. /purchase-orders/[id]) nilai URL baru ada saat request, jadi shell dashboard
 * wajib di dalam Suspense supaya build tidak gagal prerender.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <div className="flex min-h-screen flex-1">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="flex-1 p-6">
            <AuthGuard>{children}</AuthGuard>
          </main>
        </div>
      </div>
    </Suspense>
  );
}
