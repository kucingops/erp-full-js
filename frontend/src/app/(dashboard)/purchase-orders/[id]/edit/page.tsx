import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EditPurchaseOrder } from "@/features/purchase-orders/edit-purchase-order";

export default function EditPurchaseOrderPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <EditPurchaseOrder />
    </Suspense>
  );
}
