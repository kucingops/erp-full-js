import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { JournalSourceType } from '../generated/prisma/enums.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import { wibDate } from '../currencies/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { wibStartOfDay } from '../reports/report-period.js';
import type { CreateJournalEntryDto, JournalQueryDto } from './dto/accounting.dto.js';
import { insertEntry, JOURNAL_LOCK_KEY, journalNumberer } from './journal-writer.js';
import { JournalPostingService } from './journal-posting.service.js';
import { reverseLines, totals } from './posting-rules.js';

const SORTABLE = ['date', 'number', 'createdAt'] as const;
const DAY_MS = 86_400_000;

const LINE_INCLUDE = {
  lines: {
    orderBy: { lineNo: 'asc' },
    include: { account: { select: { id: true, code: true, name: true, type: true } } },
  },
} satisfies Prisma.JournalEntryInclude;

@Injectable()
export class JournalEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: JournalPostingService,
  ) {}

  async findAll(q: JournalQueryDto) {
    await this.posting.sync();
    const where: Prisma.JournalEntryWhereInput = {
      ...(q.sourceType && { sourceType: q.sourceType }),
      ...(q.accountId && { lines: { some: { accountId: q.accountId } } }),
      ...((q.from || q.to) && {
        date: {
          ...(q.from && { gte: wibStartOfDay(q.from) }),
          ...(q.to && { lt: new Date(wibStartOfDay(q.to).getTime() + DAY_MS) }),
        },
      }),
      ...(q.search && {
        OR: [
          { number: { contains: q.search, mode: 'insensitive' } },
          { description: { contains: q.search, mode: 'insensitive' } },
          { sourceNumber: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
    const orderBy = [toOrderBy(q.sortBy, SORTABLE, 'date', q.sortOrder), { number: q.sortOrder }];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({ where, orderBy, ...toSkipTake(q), include: LINE_INCLUDE }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return paginate(rows.map(withTotal), total, q);
  }

  async findOne(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        ...LINE_INCLUDE,
        reversalOf: { select: { id: true, number: true } },
        reversedBy: { select: { id: true, number: true } },
      },
    });
    if (!entry) throw new NotFoundException('Jurnal tidak ditemukan');
    return withTotal(entry);
  }

  /** Jurnal umum (manual), mis. setoran modal, beban operasional. */
  async create(dto: CreateJournalEntryDto, user: AuthUser) {
    const lines = dto.lines.map((l) => ({
      accountId: l.accountId,
      debit: new Prisma.Decimal(l.debit ?? 0),
      credit: new Prisma.Decimal(l.credit ?? 0),
      description: l.description,
    }));
    lines.forEach((l, i) => {
      if (l.debit.isZero() === l.credit.isZero()) {
        throw new BadRequestException(`Baris ${i + 1}: isi debit ATAU kredit (salah satu, > 0)`);
      }
    });
    const t = totals(lines);
    if (!t.debit.eq(t.credit)) {
      throw new BadRequestException(
        `Jurnal tidak seimbang: debit ${t.debit.toFixed(2)} vs kredit ${t.credit.toFixed(2)}`,
      );
    }

    const ids = [...new Set(lines.map((l) => l.accountId))];
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, isPostable: true, isActive: true },
    });
    if (accounts.length !== ids.length) throw new NotFoundException('Ada akun yang tidak ditemukan');
    const bad = accounts.find((a) => !a.isPostable || !a.isActive);
    if (bad) throw new BadRequestException(`Akun ${bad.code} adalah header atau nonaktif`);

    const date = new Date(`${dto.date.slice(0, 10)}T00:00:00Z`);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${JOURNAL_LOCK_KEY})`;
      const next = await journalNumberer(tx);
      return insertEntry(tx, next(), {
        date,
        description: dto.description,
        sourceType: JournalSourceType.MANUAL,
        createdById: user.id,
        lines,
      });
    });
    return this.findOne(created.id);
  }

  /**
   * Batalkan jurnal manual dengan jurnal pembalik (bukan hapus: buku besar append-only,
   * sama seperti kartu stok). Jurnal otomatis dibalik oleh sistem saat dokumennya dihapus.
   */
  async reverse(id: string, user: AuthUser, date?: string) {
    const entry = await this.findOne(id);
    if (entry.sourceType !== JournalSourceType.MANUAL) {
      throw new BadRequestException('Jurnal otomatis tidak bisa dibalik manual: hapus/koreksi dokumen sumbernya');
    }
    if (entry.reversalOf) throw new BadRequestException('Jurnal pembalik tidak bisa dibalik lagi');
    if (entry.reversedBy) throw new BadRequestException(`Jurnal sudah dibalik oleh ${entry.reversedBy.number}`);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${JOURNAL_LOCK_KEY})`;
      const next = await journalNumberer(tx);
      return insertEntry(tx, next(), {
        date: date ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : wibDate(new Date()),
        description: `Pembalik ${entry.number}: ${entry.description}`,
        sourceType: JournalSourceType.MANUAL,
        reversalOfId: entry.id,
        createdById: user.id,
        lines: reverseLines(entry.lines),
      });
    });
    return this.findOne(created.id);
  }
}

function withTotal<T extends { lines: { debit: Prisma.Decimal; credit: Prisma.Decimal }[] }>(e: T) {
  return { ...e, totalAmount: totals(e.lines).debit };
}
