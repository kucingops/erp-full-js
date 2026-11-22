"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useSalesOrder } from "@/features/sales-orders/api";
import { SalesOrderForm } from "./sales-order-form";

export function EditSalesOrder() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useSalesOrder(id);

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;
  if (data.status !== "DRAFT") {
    return <p className="text-muted-foreground">Hanya SO berstatus draft yang bisa diedit.</p>;
  }
  return (
    <>
      <PageHeader title={`Edit ${data.number}`} />
      <SalesOrderForm initial={data} />
    </>
  );
}
