import type { Role } from "@/lib/types";

/**
 * Daftar laporan + role yang boleh membuka. Harus sama dengan @Roles() di
 * backend `reports.controller.ts`. Menu sidebar "Laporan" memakai gabungan role ini,
 * lalu tiap tab/halaman dicek lagi di sini (AuthGuard hanya cek per menu).
 */
export interface ReportDef {
  href: string;
  /** path endpoint backend, tanpa /api */
  endpoint: string;
  label: string;
  description: string;
  roles: Role[];
}

export const REPORTS: ReportDef[] = [
  {
    href: "/reports/sales",
    endpoint: "/reports/sales",
    label: "Penjualan",
    description: "Omzet per periode, customer, atau produk",
    roles: ["SALES"],
  },
  {
    href: "/reports/purchases",
    endpoint: "/reports/purchases",
    label: "Pembelian",
    description: "Belanja per periode, supplier, atau produk",
    roles: ["PURCHASING"],
  },
  {
    href: "/reports/stock-valuation",
    endpoint: "/reports/stock-valuation",
    label: "Nilai Stok",
    description: "Nilai persediaan saat ini (qty x harga pokok)",
    roles: ["WAREHOUSE", "SALES", "PURCHASING"],
  },
  {
    href: "/reports/stock-movements",
    endpoint: "/reports/stock-movements",
    label: "Mutasi Stok",
    description: "Saldo awal, masuk, keluar, penyesuaian, saldo akhir per produk",
    roles: ["WAREHOUSE", "SALES", "PURCHASING"],
  },
];

/** Gabungan role semua laporan, dipakai menu sidebar. */
export const REPORT_ROLES: Role[] = [...new Set(REPORTS.flatMap((r) => r.roles))];

export function canSeeReport(role: Role | undefined, report: ReportDef) {
  return !!role && (role === "ADMIN" || report.roles.includes(role));
}
