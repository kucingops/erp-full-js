import { AuditAction } from '../generated/prisma/enums.js';
import { AUDITED_ENTITIES, resolveAuditTarget } from './audit-targets.js';

describe('resolveAuditTarget', () => {
  const id = 'id-1';

  it('CRUD standar', () => {
    expect(resolveAuditTarget('POST', '/products/', {})).toEqual({
      entity: 'product',
      model: 'product',
      action: AuditAction.CREATE,
    });
    expect(resolveAuditTarget('PATCH', 'products/:id', { id })).toMatchObject({
      action: AuditAction.UPDATE,
      entityId: id,
    });
    expect(resolveAuditTarget('DELETE', 'customers/:id', { id })).toMatchObject({
      entity: 'customer',
      action: AuditAction.DELETE,
      entityId: id,
    });
  });

  it('aksi status: POST /:id/<aksi>', () => {
    expect(resolveAuditTarget('POST', 'purchase-orders/:id/approve', { id })).toEqual({
      entity: 'purchaseOrder',
      model: 'purchaseOrder',
      action: AuditAction.STATUS,
      entityId: id,
      operation: 'approve',
    });
  });

  it('sub-resource payment', () => {
    expect(resolveAuditTarget('POST', 'sales-invoices/:id/payments', { id })).toMatchObject({
      entity: 'payment',
      action: AuditAction.CREATE,
      parent: { key: 'invoiceId', id },
    });
    expect(
      resolveAuditTarget('DELETE', 'purchase-bills/:id/payments/:paymentId', {
        id,
        paymentId: 'p-1',
      }),
    ).toMatchObject({ entity: 'payment', action: AuditAction.DELETE, entityId: 'p-1' });
  });

  it('resource tidak terdaftar / pola lain = null', () => {
    expect(resolveAuditTarget('POST', 'auth/login', {})).toBeNull();
    expect(resolveAuditTarget('POST', 'inventory/adjustments', {})).toBeNull();
    expect(resolveAuditTarget('POST', 'products/:id', { id })).toBeNull();
  });

  it('override dari dekorator menang atas registry', () => {
    expect(
      resolveAuditTarget('POST', 'inventory/', {}, { entity: 'stockAdjustment' }),
    ).toMatchObject({ entity: 'stockAdjustment', action: AuditAction.CREATE });
  });

  it('entity unik untuk filter FE', () => {
    expect(AUDITED_ENTITIES).toEqual(expect.arrayContaining(['invoice', 'payment', 'user']));
    expect(new Set(AUDITED_ENTITIES).size).toBe(AUDITED_ENTITIES.length);
  });
});
