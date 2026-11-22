import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS_LABEL, type InvoiceStatus } from "./types";

const VARIANT: Record<InvoiceStatus, "outline" | "secondary" | "default"> = {
  UNPAID: "outline",
  PARTIAL: "secondary",
  PAID: "default",
};

export function InvoiceStatusBadge({
  status,
  isOverdue,
}: {
  status: InvoiceStatus;
  isOverdue?: boolean;
}) {
  return (
    <span className="inline-flex gap-1">
      <Badge variant={VARIANT[status]}>{INVOICE_STATUS_LABEL[status]}</Badge>
      {isOverdue && <Badge variant="destructive">Lewat jatuh tempo</Badge>}
    </span>
  );
}
