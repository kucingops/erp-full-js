import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SALES_INVOICE } from "@/features/invoicing/config";
import { InvoiceDetail } from "@/features/invoicing/invoice-detail";

// useParams() baru punya nilai saat request (cacheComponents), jadi dibungkus Suspense.
export default function SalesInvoicesDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <InvoiceDetail cfg={SALES_INVOICE} />
    </Suspense>
  );
}
