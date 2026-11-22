import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SalesOrderDetail } from "@/features/sales-orders/sales-order-detail";

// useParams() baru punya nilai saat request (cacheComponents), jadi dibungkus Suspense.
export default function SalesOrderDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SalesOrderDetail />
    </Suspense>
  );
}
