import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ClipboardCheck,
  BarChart3,
  BookOpen,
  Boxes,
  FileText,
  History,
  Receipt,
  Coins,
  Building2,
  LayoutDashboard,
  Package,
  Tags,
  Users,
  UserSquare,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { REPORT_ROLES } from "@/features/reports/reports";
import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Role yang boleh lihat menu. Kosong = semua role. ADMIN selalu boleh. */
  roles?: Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Menu sidebar. Modul baru cukup tambah item di sini.
 * Role di sini harus sama dengan @Roles() di controller backend.
 */
export const NAV: NavGroup[] = [
  {
    label: "Umum",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Master Data",
    items: [
      { href: "/products", label: "Produk", icon: Package },
      { href: "/categories", label: "Kategori", icon: Tags, roles: ["WAREHOUSE"] },
      { href: "/customers", label: "Customer", icon: UserSquare, roles: ["SALES"] },
      { href: "/suppliers", label: "Supplier", icon: Building2, roles: ["PURCHASING"] },
      { href: "/warehouses", label: "Gudang", icon: Warehouse, roles: ["WAREHOUSE"] },
    ],
  },
  {
    label: "Transaksi",
    items: [
      { href: "/inventory", label: "Inventory", icon: Boxes, roles: ["WAREHOUSE", "SALES", "PURCHASING"] },
      { href: "/purchase-orders", label: "Purchase Order", icon: ArrowDownToLine, roles: ["PURCHASING", "WAREHOUSE"] },
      { href: "/sales-orders", label: "Sales Order", icon: ArrowUpFromLine, roles: ["SALES", "WAREHOUSE"] },
      { href: "/stock-transfers", label: "Transfer Stok", icon: ArrowLeftRight, roles: ["WAREHOUSE"] },
      { href: "/stock-opnames", label: "Stock Opname", icon: ClipboardCheck, roles: ["WAREHOUSE"] },
    ],
  },
  {
    label: "Laporan",
    items: [{ href: "/reports", label: "Laporan", icon: BarChart3, roles: REPORT_ROLES }],
  },
  {
    label: "Keuangan",
    items: [
      { href: "/sales-invoices", label: "Invoice Penjualan", icon: FileText, roles: ["SALES"] },
      { href: "/purchase-bills", label: "Tagihan Supplier", icon: Receipt, roles: ["PURCHASING"] },
      { href: "/accounting", label: "Akuntansi", icon: BookOpen, roles: ["ADMIN"] },
    ],
  },
  {
    label: "Pengaturan",
    items: [
      { href: "/currencies", label: "Mata Uang & Kurs", icon: Coins },
      { href: "/users", label: "User", icon: Users, roles: ["ADMIN"] },
      { href: "/audit-logs", label: "Audit Log", icon: History, roles: ["ADMIN"] },
    ],
  },
];

export function canAccess(role: Role | undefined, roles?: Role[]) {
  if (!role) return false;
  if (role === "ADMIN" || !roles || roles.length === 0) return true;
  return roles.includes(role);
}
