export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "STATUS";

export type AuditJson = Record<string, unknown> | null;

export interface AuditLog {
  id: string;
  userId: string | null;
  user: { id: string; name: string; email: string } | null;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  /** Nama aksi status: approve, ship, deactivate, reset-password, ... */
  operation: string | null;
  before: AuditJson;
  after: AuditJson;
  ip: string | null;
  createdAt: string;
}

export const ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: "Buat",
  UPDATE: "Ubah",
  DELETE: "Hapus",
  STATUS: "Aksi status",
};

/** Nama entity backend (model Prisma) → label UI. Entity baru tanpa label tampil apa adanya. */
export const ENTITY_LABEL: Record<string, string> = {
  product: "Produk",
  category: "Kategori",
  customer: "Customer",
  supplier: "Supplier",
  warehouse: "Gudang",
  purchaseOrder: "Purchase Order",
  salesOrder: "Sales Order",
  invoice: "Invoice / Tagihan",
  payment: "Pembayaran",
  currency: "Mata uang",
  exchangeRate: "Kurs",
  user: "User",
};

export const OPERATION_LABEL: Record<string, string> = {
  approve: "Setujui",
  receive: "Terima barang",
  cancel: "Batalkan",
  confirm: "Konfirmasi",
  ship: "Kirim",
  activate: "Aktifkan",
  deactivate: "Nonaktifkan",
  "reset-password": "Reset password",
};

export const entityLabel = (e: string) => ENTITY_LABEL[e] ?? e;
export const operationLabel = (o: string) => OPERATION_LABEL[o] ?? o;
