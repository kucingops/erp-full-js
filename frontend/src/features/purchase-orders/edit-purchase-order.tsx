"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { usePurchaseOrder } from "@/features/purchase-orders/api";
import { PurchaseOrderForm } from "./purchase-order-form";

export function EditPurchaseOrder() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = usePurchaseOrder(id);

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;
  if (data.status !== "DRAFT") {
    return <p className="text-muted-foreground">Hanya PO berstatus draft yang bisa diedit.</p>;
  }
  return (
    <>
      <PageHeader title={`Edit ${data.number}`} />
      <PurchaseOrderForm initial={data} />
    </>
  );
}
