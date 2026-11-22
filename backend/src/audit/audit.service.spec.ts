import { Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { baseQuery } from '../master-data/testing.js';
import { AuditService } from './audit.service.js';
import { sanitizeForAudit } from './sanitize.js';

function setup() {
  const auditLog = {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findUnique: vi.fn(),
  };
  const product = { findUnique: vi.fn(), findFirst: vi.fn() };
  const payment = { findUnique: vi.fn(), findFirst: vi.fn() };
  const prisma = {
    auditLog,
    product,
    payment,
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return {
    auditLog,
    product,
    payment,
    service: new AuditService(prisma as unknown as PrismaService),
  };
}

const actor = { userId: 'u-1', ip: '127.0.0.1' };

describe('sanitizeForAudit', () => {
  it('buang key rahasia secara rekursif + Decimal/Date jadi JSON polos', () => {
    const out = sanitizeForAudit({
      id: '1',
      passwordHash: 'x',
      price: new Prisma.Decimal('12.50'),
      at: new Date('2026-11-01T00:00:00Z'),
      nested: [{ refreshToken: 'r', tokenHash: 't', name: 'ok' }],
    });
    expect(out).toEqual({
      id: '1',
      price: '12.5',
      at: '2026-11-01T00:00:00.000Z',
      nested: [{ name: 'ok' }],
    });
  });

  it('null/undefined = null', () => {
    expect(sanitizeForAudit(undefined)).toBeNull();
  });
});

describe('AuditService', () => {
  it('UPDATE: after diambil ulang dari DB, before/after disanitasi', async () => {
    const { auditLog, product, service } = setup();
    product.findUnique.mockResolvedValue({ id: 'p-1', name: 'Baru' });
    await service.recordTarget(
      { action: AuditAction.UPDATE, entity: 'product', model: 'product', entityId: 'p-1' },
      { id: 'p-1', name: 'Lama' },
      { id: 'p-1', name: 'Baru', category: {} },
      actor,
    );
    expect(auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'u-1',
        ip: '127.0.0.1',
        action: AuditAction.UPDATE,
        entity: 'product',
        entityId: 'p-1',
        operation: null,
        before: { id: 'p-1', name: 'Lama' },
        after: { id: 'p-1', name: 'Baru' },
      },
    });
  });

  it('CREATE: entityId dari response body', async () => {
    const { auditLog, product, service } = setup();
    product.findUnique.mockResolvedValue({ id: 'p-9' });
    await service.recordTarget(
      { action: AuditAction.CREATE, entity: 'product', model: 'product' },
      null,
      { id: 'p-9' },
      actor,
    );
    expect(product.findUnique).toHaveBeenCalledWith({ where: { id: 'p-9' } });
    expect(auditLog.create.mock.calls[0][0].data).toMatchObject({
      entityId: 'p-9',
      before: undefined,
    });
  });

  it('DELETE: after kosong, tidak query ulang', async () => {
    const { auditLog, product, service } = setup();
    await service.recordTarget(
      { action: AuditAction.DELETE, entity: 'product', model: 'product', entityId: 'p-1' },
      { id: 'p-1' },
      undefined,
      actor,
    );
    expect(product.findUnique).not.toHaveBeenCalled();
    expect(auditLog.create.mock.calls[0][0].data).toMatchObject({
      before: { id: 'p-1' },
      after: undefined,
    });
  });

  it('CREATE child (payment): ambil baris terbaru milik parent', async () => {
    const { auditLog, payment, service } = setup();
    payment.findFirst.mockResolvedValue({ id: 'pay-1', invoiceId: 'inv-1' });
    await service.recordTarget(
      {
        action: AuditAction.CREATE,
        entity: 'payment',
        model: 'payment',
        parent: { key: 'invoiceId', id: 'inv-1' },
      },
      null,
      { id: 'inv-1', payments: [] },
      actor,
    );
    expect(payment.findFirst).toHaveBeenCalledWith({
      where: { invoiceId: 'inv-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditLog.create.mock.calls[0][0].data.entityId).toBe('pay-1');
  });

  it('model tanpa delegate: after = response body', async () => {
    const { auditLog, service } = setup();
    await service.recordTarget(
      { action: AuditAction.CREATE, entity: 'ghost', model: 'ghost' },
      null,
      { id: 'g-1', secret: 's' },
      actor,
    );
    expect(auditLog.create.mock.calls[0][0].data.after).toEqual({ id: 'g-1' });
  });

  it('gagal tulis audit tidak melempar error ke request', async () => {
    const { auditLog, service } = setup();
    auditLog.create.mockRejectedValue(new Error('db down'));
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    await expect(
      service.recordTarget(
        { action: AuditAction.DELETE, entity: 'product', entityId: 'p-1' },
        null,
        null,
        actor,
      ),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('snapshot: id kosong / error = null', async () => {
    const { product, service } = setup();
    expect(await service.snapshot('product', undefined)).toBeNull();
    product.findUnique.mockRejectedValue(new Error('x'));
    expect(await service.snapshot('product', 'p-1')).toBeNull();
  });

  it('findAll: filter entity, user, action, rentang tanggal WIB', async () => {
    const { auditLog, service } = setup();
    await service.findAll({
      ...baseQuery,
      entity: 'product',
      userId: 'u-1',
      action: AuditAction.UPDATE,
      from: '2026-11-01',
      to: '2026-11-30',
    });
    const { where, orderBy } = auditLog.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ entity: 'product', userId: 'u-1', action: AuditAction.UPDATE });
    expect(where.createdAt.gte.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(where.createdAt.lte.toISOString()).toBe('2026-11-30T16:59:59.999Z');
    expect(orderBy).toEqual({ createdAt: 'desc' });
  });
});
