import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StockOpnameDetail } from "@/features/stock-ops/opname-detail";

// useParams() baru punya nilai saat request (cacheComponents), jadi dibungkus Suspense.
export default function StockOpnameDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <StockOpnameDetail />
    </Suspense>
  );
}
