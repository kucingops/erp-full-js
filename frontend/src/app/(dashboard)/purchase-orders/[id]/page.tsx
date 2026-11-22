import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PurchaseOrderDetail } from "@/features/purchase-orders/purchase-order-detail";

// useParams() baru punya nilai saat request (cacheComponents), jadi dibungkus Suspense.
export default function PurchaseOrderDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PurchaseOrderDetail />
    </Suspense>
  );
}
