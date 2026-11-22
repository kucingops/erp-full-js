import { Badge } from "@/components/ui/badge";
import {
  OPNAME_STATUS_LABEL,
  TRANSFER_STATUS_LABEL,
  type StockOpnameStatus,
  type StockTransferStatus,
} from "./types";

type Variant = "outline" | "secondary" | "default" | "destructive";

const TRANSFER_VARIANT: Record<StockTransferStatus, Variant> = {
  DRAFT: "outline",
  SENT: "secondary",
  RECEIVED: "default",
  CANCELLED: "destructive",
};

const OPNAME_VARIANT: Record<StockOpnameStatus, Variant> = {
  DRAFT: "outline",
  POSTED: "default",
  CANCELLED: "destructive",
};

export function TransferStatusBadge({ status }: { status: StockTransferStatus }) {
  return <Badge variant={TRANSFER_VARIANT[status]}>{TRANSFER_STATUS_LABEL[status]}</Badge>;
}

export function OpnameStatusBadge({ status }: { status: StockOpnameStatus }) {
  return <Badge variant={OPNAME_VARIANT[status]}>{OPNAME_STATUS_LABEL[status]}</Badge>;
}

/** Label + nilai di kartu info header dokumen. */
export function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}

/** Selisih bertanda warna: + hijau, − merah, 0 abu. */
export function Variance({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  if (value === 0) return <span className="text-muted-foreground tabular-nums">0</span>;
  return (
    <span className={value > 0 ? "text-green-600 tabular-nums" : "text-destructive tabular-nums"}>
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
export const formatDate = (v: string) => date.format(new Date(v));
export const formatDateTime = (v: string) => dateTime.format(new Date(v));
