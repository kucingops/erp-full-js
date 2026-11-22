import { SetMetadata } from '@nestjs/common';
import type { AuditResourceConfig } from './audit-targets.js';

export const AUDIT_KEY = 'audit:resource';
export const SKIP_AUDIT_KEY = 'audit:skip';

/**
 * Tandai controller/method supaya di-audit sebagai entity tertentu.
 * `@Audit('product')` = entity & delegate Prisma `product`.
 * Opsional: modul yang sudah ada di `AUDITED_RESOURCES` otomatis ke-audit tanpa dekorator.
 * Mirip anotasi `@Audited` Hibernate Envers di Java.
 */
export const Audit = (config: string | AuditResourceConfig) =>
  SetMetadata(
    AUDIT_KEY,
    typeof config === 'string' ? { entity: config, model: config } : config,
  );

/** Matikan audit untuk method tertentu (mis. endpoint mutasi yang tidak penting). */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
