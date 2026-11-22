"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { canSeeReport, REPORTS } from "@/features/reports/reports";
import { useAuthStore } from "@/lib/auth-store";

/** /reports -> buka laporan pertama yang boleh dilihat role user. */
export default function ReportsIndexPage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const first = REPORTS.find((r) => canSeeReport(role, r));

  useEffect(() => {
    if (first) router.replace(first.href);
  }, [first, router]);

  return <Skeleton className="h-64 w-full" />;
}