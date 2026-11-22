"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SOURCE_LABEL, type JournalSourceType } from "./types";

export const ACCOUNTING_TABS = [
  { href: "/accounting/accounts", label: "Bagan Akun" },
  { href: "/accounting/journals", label: "Jurnal" },
  { href: "/accounting/ledger", label: "Buku Besar" },
  { href: "/accounting/trial-balance", label: "Neraca Saldo" },
];

/** Tab antar halaman akuntansi (pola sama dengan ReportTabs). */
export function AccountingTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b">
      {ACCOUNTING_TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
            pathname === t.href
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

const idr = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Angka akuntansi: tanpa simbol, negatif dalam kurung, 0 jadi "-". */
export function formatAmount(v: string | number) {
  const n = Number(v);
  if (n === 0) return "-";
  return n < 0 ? `(${idr.format(-n)})` : idr.format(n);
}

const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
/** Tanggal jurnal disimpan sebagai tanggal kalender (00:00 UTC), jadi format di UTC. */
export const formatJournalDate = (iso: string) => dateFmt.format(new Date(iso));

export function SourceBadge({ type }: { type: JournalSourceType }) {
  return <Badge variant={type === "MANUAL" ? "outline" : "secondary"}>{SOURCE_LABEL[type]}</Badge>;
}

/** Link ke dokumen sumber jurnal otomatis, kalau halamannya ada. */
export function sourceHref(type: JournalSourceType, sourceId: string | null) {
  if (!sourceId) return null;
  if (type === "SALES_INVOICE") return `/sales-invoices/${sourceId}`;
  if (type === "PURCHASE_BILL") return `/purchase-bills/${sourceId}`;
  return null;
}
