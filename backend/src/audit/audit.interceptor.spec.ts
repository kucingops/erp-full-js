import { Controller, Get, type ExecutionContext, Patch, Post } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuditAction } from '../generated/prisma/enums.js';
import { Audit, SkipAudit } from './audit.decorator.js';
import { AuditInterceptor } from './audit.interceptor.js';
import type { AuditService } from './audit.service.js';

@Controller('purchase-orders')
class FakePoController {
  @Post(':id/approve')
  approve() {}

  @Get()
  list() {}

  @SkipAudit()
  @Patch(':id')
  quiet() {}
}

@Audit('widget')
@Controller('widgets')
class FakeWidgetController {
  @Post()
  create() {}
}

function ctx(cls: object, handler: () => void, method: string, params = {}) {
  const req = { method, params, user: { id: 'u-1' }, ip: '::1' };
  return {
    getType: () => 'http',
    getClass: () => cls,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function setup() {
  const audit = {
    snapshot: vi.fn().mockResolvedValue({ id: 'po-1', status: 'DRAFT' }),
    recordTarget: vi.fn().mockResolvedValue(undefined),
  };
  const interceptor = new AuditInterceptor(new Reflector(), audit as unknown as AuditService);
  return { audit, interceptor };
}

describe('AuditInterceptor', () => {
  it('aksi status: snapshot before lalu catat setelah sukses', async () => {
    const { audit, interceptor } = setup();
    const p = FakePoController.prototype;
    const res = await firstValueFrom(
      interceptor.intercept(ctx(FakePoController, p.approve, 'POST', { id: 'po-1' }), {
        handle: () => of({ id: 'po-1', status: 'APPROVED' }),
      }),
    );
    expect(res).toEqual({ id: 'po-1', status: 'APPROVED' });
    expect(audit.snapshot).toHaveBeenCalledWith('purchaseOrder', 'po-1');
    expect(audit.recordTarget).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.STATUS, operation: 'approve' }),
      { id: 'po-1', status: 'DRAFT' },
      { id: 'po-1', status: 'APPROVED' },
      { userId: 'u-1', ip: '::1' },
    );
  });

  it('handler error: tidak dicatat', async () => {
    const { audit, interceptor } = setup();
    const p = FakePoController.prototype;
    await expect(
      firstValueFrom(
        interceptor.intercept(ctx(FakePoController, p.approve, 'POST', { id: 'po-1' }), {
          handle: () => throwError(() => new Error('gagal')),
        }),
      ),
    ).rejects.toThrow('gagal');
    expect(audit.recordTarget).not.toHaveBeenCalled();
  });

  it('GET & @SkipAudit tidak di-audit', async () => {
    const { audit, interceptor } = setup();
    const p = FakePoController.prototype;
    await firstValueFrom(
      interceptor.intercept(ctx(FakePoController, p.list, 'GET'), { handle: () => of([]) }),
    );
    await firstValueFrom(
      interceptor.intercept(ctx(FakePoController, p.quiet, 'PATCH', { id: 'x' }), {
        handle: () => of({}),
      }),
    );
    expect(audit.snapshot).not.toHaveBeenCalled();
    expect(audit.recordTarget).not.toHaveBeenCalled();
  });

  it('@Audit di class dipakai untuk resource di luar registry', async () => {
    const { audit, interceptor } = setup();
    await firstValueFrom(
      interceptor.intercept(
        ctx(FakeWidgetController, FakeWidgetController.prototype.create, 'POST'),
        { handle: () => of({ id: 'w-1' }) },
      ),
    );
    expect(audit.recordTarget.mock.calls[0][0]).toMatchObject({
      entity: 'widget',
      action: AuditAction.CREATE,
    });
  });
});
