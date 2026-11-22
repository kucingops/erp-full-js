import { Badge } from "@/components/ui/badge";
import { SO_STATUS_LABEL, type SalesOrderStatus } from "./types";

const VARIANT: Record<SalesOrderStatus, "outline" | "secondary" | "default" | "destructive"> = {
  DRAFT: "outline",
  CONFIRMED: "secondary",
  SHIPPED: "default",
  CANCELLED: "destructive",
};

export function SalesOrderStatusBadge({ status }: { status: SalesOrderStatus }) {
  return <Badge variant={VARIANT[status]}>{SO_STATUS_LABEL[status]}</Badge>;
}
