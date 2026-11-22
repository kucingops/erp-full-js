import { Role } from '../generated/prisma/enums.js';

/**
 * Bagian dashboard mana yang boleh dilihat tiap role.
 * Sumbernya matriks role di CONTRIBUTING.md, jadi dashboard tidak membocorkan
 * angka yang di halaman aslinya juga tidak boleh dibaca role tersebut.
 *
 * Kenapa fungsi murni dan bukan @Roles() per endpoint? Karena satu endpoint
 * `summary` dipakai semua role, isinya saja yang beda. Mirip "field-level
 * authorization" di Spring (misal @JsonView per role).
 */
export interface DashboardScope {
  sales: boolean;
  purchases: boolean;
  customers: boolean;
  suppliers: boolean;
  users: boolean;
  /** stok menipis: inventory boleh dibaca semua role */
  inventory: boolean;
}

export function dashboardScope(role: Role): DashboardScope {
  const is = (...roles: Role[]) => role === Role.ADMIN || roles.includes(role);
  return {
    sales: is(Role.SALES, Role.WAREHOUSE),
    purchases: is(Role.PURCHASING, Role.WAREHOUSE),
    customers: is(Role.SALES),
    suppliers: is(Role.PURCHASING),
    users: is(),
    inventory: true,
  };
}
