import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Building2,
  LayoutDashboard,
  Package,
  Users,
  UserSquare,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
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
    ],
  },
  {
    label: "Pengaturan",
    items: [{ href: "/users", label: "User", icon: Users, roles: ["ADMIN"] }],
  },
];

export function canAccess(role: Role | undefined, roles?: Role[]) {
  if (!role) return false;
  if (role === "ADMIN" || !roles || roles.length === 0) return true;
  return roles.includes(role);
}
