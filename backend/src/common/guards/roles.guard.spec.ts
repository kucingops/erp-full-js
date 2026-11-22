import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/enums.js';
import { RolesGuard } from './roles.guard.js';

const ctxWithUser = (role?: Role) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { id: 'u', email: 'e', role } : undefined }),
    }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const requireRoles = (roles?: Role[]) =>
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

  it('lolos kalau endpoint tidak pakai @Roles', () => {
    requireRoles(undefined);
    expect(guard.canActivate(ctxWithUser(Role.SALES))).toBe(true);
  });

  it('lolos kalau role cocok', () => {
    requireRoles([Role.PURCHASING]);
    expect(guard.canActivate(ctxWithUser(Role.PURCHASING))).toBe(true);
  });

  it('ADMIN selalu lolos', () => {
    requireRoles([Role.WAREHOUSE]);
    expect(guard.canActivate(ctxWithUser(Role.ADMIN))).toBe(true);
  });

  it('403 kalau role tidak cocok', () => {
    requireRoles([Role.PURCHASING]);
    expect(() => guard.canActivate(ctxWithUser(Role.SALES))).toThrow(ForbiddenException);
  });
});
