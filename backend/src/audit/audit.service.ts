import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { AuditAction } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type { AuditTarget } from './audit-targets.js';
import type { AuditQueryDto } from './dto/audit.dto.js';
import { sanitizeForAudit } from './sanitize.js';

/** Delegate Prisma minimal yang dipakai untuk snapshot (semua model punya method ini). */
interface SnapshotDelegate {
  findUnique(args: { where: { id: string } }): Promise<unknown>;
  findFirst(args: {
    where: Record<string, string>;
    orderBy: { createdAt: 'desc' };
  }): Promise<unknown>;
}

export interface AuditActor {
  userId?: string | null;
  ip?: string | null;
}

export interface AuditEntry extends AuditActor {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  operation?: string | null;
  before?: unknown;
  after?: unknown;
}

const SORTABLE = ['createdAt', 'entity', 'action'] as const;

/** Batas hari WIB (UTC+7) → Date UTC. `to` inklusif sampai 23:59:59.999. */
const wibStart = (d: string) => new Date(`${d}T00:00:00.000+07:00`);
const wibEnd = (d: string) => new Date(`${d}T23:59:59.999+07:00`);

const idOf = (v: unknown) =>
  v && typeof v === 'object' && 'id' in v && typeof v.id === 'string' ? v.id : undefined;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private delegate(model?: string): SnapshotDelegate | undefined {
    if (!model) return undefined;
    const d = (this.prisma as unknown as Record<string, unknown>)[model];
    return d && typeof (d as SnapshotDelegate).findUnique === 'function'
      ? (d as SnapshotDelegate)
      : undefined;
  }

  /** Ambil baris "polos" (tanpa relasi) sebagai snapshot. Gagal = null, tidak pernah throw. */
  async snapshot(model: string | undefined, id: string | undefined): Promise<unknown> {
    const d = this.delegate(model);
    if (!d || !id) return null;
    try {
      return await d.findUnique({ where: { id } });
    } catch {
      return null;
    }
  }

  /**
   * Dipanggil interceptor setelah handler sukses.
   * After diambil ulang dari DB (bentuknya sama dengan before, jadi diff-nya bersih);
   * kalau tidak ada delegate, pakai response body.
   */
  async recordTarget(
    target: AuditTarget,
    before: unknown,
    responseBody: unknown,
    actor: AuditActor,
  ): Promise<void> {
    try {
      let entityId = target.entityId ?? idOf(responseBody);
      let after: unknown = null;
      if (target.action !== AuditAction.DELETE) {
        if (target.parent) {
          after = await this.delegate(target.model)?.findFirst({
            where: { [target.parent.key]: target.parent.id },
            orderBy: { createdAt: 'desc' },
          });
          entityId = idOf(after) ?? entityId;
        } else {
          after = await this.snapshot(target.model, entityId);
        }
        after ??= responseBody;
      }
      await this.log({
        ...actor,
        action: target.action,
        entity: target.entity,
        entityId,
        operation: target.operation,
        before,
        after,
      });
    } catch (e) {
      this.logger.error(`Gagal mencatat audit ${target.entity}`, e as Error);
    }
  }

  /** Tulis satu baris audit. Bisa dipanggil langsung dari service lain kalau perlu log manual. */
  async log(entry: AuditEntry): Promise<void> {
    const before = sanitizeForAudit(entry.before);
    const after = sanitizeForAudit(entry.after);
    await this.prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        ip: entry.ip ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        operation: entry.operation ?? null,
        // undefined = kolom NULL di DB
        before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findAll(query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: wibStart(query.from) } : {}),
              ...(query.to ? { lte: wibEnd(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { entityId: { contains: query.search } },
              { operation: { contains: query.search, mode: 'insensitive' } },
              { user: { name: { contains: query.search, mode: 'insensitive' } } },
              { user: { email: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: toOrderBy(query.sortBy, SORTABLE, 'createdAt', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  async findOne(id: string) {
    const row = await this.prisma.auditLog.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!row) throw new NotFoundException('Audit log tidak ditemukan');
    return row;
  }
}
