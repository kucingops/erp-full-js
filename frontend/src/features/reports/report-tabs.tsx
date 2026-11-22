"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { canSeeReport, REPORTS } from "./reports";

/** Tab antar laporan. Hanya laporan yang boleh dibuka role user yang ditampilkan. */
export function ReportTabs() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b">
      {REPORTS.filter((r) => canSeeReport(role, r)).map((r) => (
        <Link
          key={r.href}
          href={r.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
            pathname === r.href
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {r.label}
        </Link>
      ))}
    </div>
  );
}
