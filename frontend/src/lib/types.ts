// Tipe yang mencerminkan response backend. Satu sumber kebenaran untuk FE.

export type Role = "ADMIN" | "WAREHOUSE" | "SALES" | "PURCHASING";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  WAREHOUSE: "Staff Gudang",
  SALES: "Sales",
  PURCHASING: "Purchasing",
};

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/** Format standar endpoint list di backend: { data, meta }. */
export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Query standar endpoint list (lihat PaginationQueryDto di backend). */
export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  [key: string]: string | number | boolean | undefined;
}

export interface User extends AuthUser {
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
