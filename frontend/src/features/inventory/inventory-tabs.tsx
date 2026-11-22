"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const TABS = [
  { href: "/inventory", label: "Stok per gudang" },
  { href: "/inventory/movements", label: "Kartu stok" },
];

/** Navigasi antar halaman inventory. */
export function InventoryTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-4 flex gap-1 border-b">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
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
