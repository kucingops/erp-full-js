import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, type Observable, switchMap, tap } from 'rxjs';
import type { AuthUser } from '../common/types/auth-user.js';
import { AUDIT_KEY, SKIP_AUDIT_KEY } from './audit.decorator.js';
import { type AuditResourceConfig, resolveAuditTarget } from './audit-targets.js';
import { AuditService } from './audit.service.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const firstPath = (p: unknown) => (Array.isArray(p) ? String(p[0] ?? '') : String(p ?? ''));

/**
 * Interceptor global (mirip AOP `@Around` di Spring):
 * 1. Sebelum handler: tentukan target dari pola route, ambil snapshot `before`.
 * 2. Handler sukses: catat log (fire-and-forget, tidak menunda response).
 * 3. Handler error: tidak dicatat (data tidak berubah).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!MUTATING.has(req.method)) return next.handle();

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, targets)) {
      return next.handle();
    }
    const override = this.reflector.getAllAndOverride<AuditResourceConfig | undefined>(
      AUDIT_KEY,
      targets,
    );
    // Pola route dari metadata Nest (bukan URL asli), jadi `:id` tetap terbaca sebagai param.
    const routePath = [
      firstPath(this.reflector.get(PATH_METADATA, context.getClass())),
      firstPath(this.reflector.get(PATH_METADATA, context.getHandler())),
    ].join('/');
    const target = resolveAuditTarget(
      req.method,
      routePath,
      (req.params ?? {}) as Record<string, string>,
      override,
    );
    if (!target) return next.handle();

    const actor = { userId: req.user?.id ?? null, ip: req.ip ?? null };
    return from(this.audit.snapshot(target.model, target.entityId)).pipe(
      switchMap((before) =>
        next.handle().pipe(
          tap((body) => {
            void this.audit.recordTarget(target, before, body, actor);
          }),
        ),
      ),
    );
  }
}
