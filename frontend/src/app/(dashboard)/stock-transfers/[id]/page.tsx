import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StockTransferDetail } from "@/features/stock-ops/transfer-detail";

// useParams() baru punya nilai saat request (cacheComponents), jadi dibungkus Suspense.
export default function StockTransferDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <StockTransferDetail />
    </Suspense>
  );
}
