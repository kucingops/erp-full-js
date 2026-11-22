import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EditSalesOrder } from "@/features/sales-orders/edit-sales-order";

export default function EditSalesOrderPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <EditSalesOrder />
    </Suspense>
  );
}
