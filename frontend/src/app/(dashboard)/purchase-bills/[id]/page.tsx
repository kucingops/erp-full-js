import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceDetail } from "@/features/invoicing/invoice-detail";

// useParams() baru punya nilai saat request (cacheComponents), jadi dibungkus Suspense.
export default function PurchaseBillsDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <InvoiceDetail resource="purchase-bills" />
    </Suspense>
  );
}
