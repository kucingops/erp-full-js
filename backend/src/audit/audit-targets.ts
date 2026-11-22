import { AuditAction } from '../generated/prisma/enums.js';

/**
 * Konfigurasi entity yang di-audit.
 * - `entity`: nama yang disimpan di kolom `entity` (sama dengan nama delegate Prisma).
 * - `model`: delegate Prisma untuk ambil snapshot before/after (`prisma[model].findUnique`).
 *   Kosongkan kalau tidak ada tabel 1:1; after diambil dari response body.
 */
export interface AuditEntityConfig {
  entity: string;
  model?: string;
}

/** Sub-resource di bawah `/:id`, contoh `/sales-invoices/:id/payments/:paymentId`. */
export interface AuditChildConfig extends AuditEntityConfig {
  /** Kolom FK ke parent, dipakai untuk cari baris yang baru dibuat. */
  parentKey: string;
  /** Nama param route untuk id child (DELETE). */
  param: string;
}

export interface AuditResourceConfig extends AuditEntityConfig {
  children?: Record<string, AuditChildConfig>;
}

const payments: AuditChildConfig = {
  entity: 'payment',
  model: 'payment',
  parentKey: 'invoiceId',
  param: 'paymentId',
};

/**
 * Registry resource → entity. Kenapa registry di sini, bukan dekorator di tiap controller?
 * Supaya modul lain (yang dikerjakan paralel) tidak perlu disentuh sama sekali.
 * Controller baru bisa juga pakai `@Audit('entity')` (dekorator menang atas registry).
 */
export const AUDITED_RESOURCES: Record<string, AuditResourceConfig> = {
  products: { entity: 'product', model: 'product' },
  categories: { entity: 'category', model: 'category' },
  customers: { entity: 'customer', model: 'customer' },
  suppliers: { entity: 'supplier', model: 'supplier' },
  warehouses: { entity: 'warehouse', model: 'warehouse' },
  'purchase-orders': { entity: 'purchaseOrder', model: 'purchaseOrder' },
  'sales-orders': { entity: 'salesOrder', model: 'salesOrder' },
  'sales-invoices': { entity: 'invoice', model: 'invoice', children: { payments } },
  'purchase-bills': { entity: 'invoice', model: 'invoice', children: { payments } },
  currencies: { entity: 'currency', model: 'currency' },
  'exchange-rates': { entity: 'exchangeRate', model: 'exchangeRate' },
  users: { entity: 'user', model: 'user' },
};

/** Daftar entity unik, dipakai FE untuk dropdown filter. */
export const AUDITED_ENTITIES = [
  ...new Set(
    Object.values(AUDITED_RESOURCES).flatMap((r) => [
      r.entity,
      ...Object.values(r.children ?? {}).map((c) => c.entity),
    ]),
  ),
];

export interface AuditTarget {
  action: AuditAction;
  entity: string;
  model?: string;
  /** Id entity kalau sudah diketahui dari route. CREATE: diisi dari response. */
  entityId?: string;
  operation?: string;
  /** Untuk CREATE child: cari baris terbaru dengan `parentKey = parentId`. */
  parent?: { key: string; id: string };
}

const isParam = (s: string | undefined) => !!s && s.startsWith(':');

/**
 * Fungsi murni: dari method + pola route (`/purchase-orders/:id/approve`) + params,
 * tentukan apa yang harus dicatat. `null` = tidak di-audit.
 *
 * Pola yang dikenali (sesuai konvensi CONTRIBUTING):
 * - `POST /res`                    → CREATE
 * - `PATCH|PUT /res/:id`           → UPDATE
 * - `DELETE /res/:id`              → DELETE
 * - `POST /res/:id/<aksi>`         → STATUS (operation = aksi)
 * - `POST /res/:id/<child>`        → CREATE child
 * - `DELETE /res/:id/<child>/:cid` → DELETE child
 */
export function resolveAuditTarget(
  method: string,
  routePath: string,
  params: Record<string, string | undefined>,
  override?: AuditResourceConfig,
): AuditTarget | null {
  const [resource, idSeg, sub, childSeg, ...extra] = routePath
    .split('/')
    .filter(Boolean);
  if (extra.length > 0) return null;
  const cfg = override ?? AUDITED_RESOURCES[resource];
  if (!cfg) return null;
  const m = method.toUpperCase();
  const base = { entity: cfg.entity, model: cfg.model };

  if (!idSeg) {
    return m === 'POST' ? { ...base, action: AuditAction.CREATE } : null;
  }
  if (!isParam(idSeg)) return null; // mis. POST /inventory/adjustments
  const id = params[idSeg.slice(1)];

  if (!sub) {
    if (m === 'PATCH' || m === 'PUT') return { ...base, action: AuditAction.UPDATE, entityId: id };
    if (m === 'DELETE') return { ...base, action: AuditAction.DELETE, entityId: id };
    return null;
  }

  const child = cfg.children?.[sub];
  if (child) {
    const childBase = { entity: child.entity, model: child.model };
    if (!childSeg && m === 'POST' && id) {
      return { ...childBase, action: AuditAction.CREATE, parent: { key: child.parentKey, id } };
    }
    if (isParam(childSeg) && m === 'DELETE') {
      return { ...childBase, action: AuditAction.DELETE, entityId: params[child.param] };
    }
    return null;
  }

  if (!childSeg && m === 'POST') {
    return { ...base, action: AuditAction.STATUS, entityId: id, operation: sub };
  }
  return null;
}
