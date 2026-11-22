import { Badge } from "@/components/ui/badge";
import { PO_STATUS_LABEL, type PurchaseOrderStatus } from "./types";

const VARIANT: Record<PurchaseOrderStatus, "outline" | "secondary" | "default" | "destructive"> = {
  DRAFT: "outline",
  APPROVED: "secondary",
  RECEIVED: "default",
  CANCELLED: "destructive",
};

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  return <Badge variant={VARIANT[status]}>{PO_STATUS_LABEL[status]}</Badge>;
}
