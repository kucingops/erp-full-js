// Tipe response master data. Boleh dipakai modul lain (PO/SO/inventory) untuk dropdown.

interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface Category extends Timestamps {
  id: string;
  name: string;
  _count?: { products: number };
}

/** Harga dari backend berupa string (Prisma Decimal). Parse dengan Number(). */
export interface Product extends Timestamps {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  costPrice: string;
  salePrice: string;
  minStock: number;
  isActive: boolean;
}

/** Customer dan Supplier punya bentuk yang sama ("partner" bisnis). */
export interface Partner extends Timestamps {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}
export type Customer = Partner;
export type Supplier = Partner;

export interface Warehouse extends Timestamps {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
}
