import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { AccountType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { wibDateKey, wibStartOfDay } from '../reports/report-period.js';
import { isDebitNormal } from './chart-of-accounts.js';
import type { LedgerQueryDto, PeriodQueryDto } from './dto/accounting.dto.js';
import { JournalPostingService } from './journal-posting.service.js';

const DAY_MS = 86_400_000;
const D = (v: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(v ?? 0);

export interface Period {
  from: string | null;
  to: string;
  /** null = sejak awal */
  start: Date | null;
  /** eksklusif */
  end: Date;
}

/** Filter tanggal WIB inklusif → [start, end). `to` default hari ini (WIB). */
export function ledgerPeriod(q: PeriodQueryDto, now = new Date()): Period {
  const to = q.to?.slice(0, 10) ?? wibDateKey(now);
  const from = q.from?.slice(0, 10) ?? null;
  return {
    from,
    to,
    start: from ? wibStartOfDay(from) : null,
    end: new Date(wibStartOfDay(to).getTime() + DAY_MS),
  };
}

/** Saldo bertanda menurut saldo normal akun: aset/beban = D - K, lainnya = K - D. */
export function signedBalance(type: AccountType, debit: Prisma.Decimal, credit: Prisma.Decimal) {
  return isDebitNormal(type) ? debit.sub(credit) : credit.sub(debit);
}

export interface TbAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  isPostable: boolean;
}
type Sums = Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>;

/**
 * Neraca saldo (fungsi murni). Per akun: saldo awal, mutasi D/K periode, saldo akhir.
 * Saldo akhir juga ditaruh di kolom debit ATAU kredit (format neraca saldo klasik):
 * total kolom debit harus = total kolom kredit kalau semua jurnal seimbang.
 */
export function buildTrialBalance(accounts: TbAccount[], opening: Sums, period: Sums, includeZero = false) {
  const zero = D(0);
  const rows = accounts
    .filter((a) => a.isPostable)
    .map((a) => {
      const o = opening.get(a.id) ?? { debit: zero, credit: zero };
      const p = period.get(a.id) ?? { debit: zero, credit: zero };
      const openingNet = o.debit.sub(o.credit); // + = sisi debit
      const closingNet = openingNet.add(p.debit).sub(p.credit);
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        openingBalance: signedBalance(a.type, o.debit, o.credit),
        debit: p.debit,
        credit: p.credit,
        closingBalance: signedBalance(a.type, o.debit.add(p.debit), o.credit.add(p.credit)),
        closingDebit: closingNet.gt(0) ? closingNet : zero,
        closingCredit: closingNet.lt(0) ? closingNet.neg() : zero,
      };
    })
    .filter(
      (r) => includeZero || !r.openingBalance.isZero() || !r.debit.isZero() || !r.credit.isZero(),
    );

  const sum = (k: 'debit' | 'credit' | 'closingDebit' | 'closingCredit') =>
    rows.reduce((s, r) => s.add(r[k]), zero);
  const total = {
    debit: sum('debit'),
    credit: sum('credit'),
    closingDebit: sum('closingDebit'),
    closingCredit: sum('closingCredit'),
  };
  return {
    rows,
    total,
    balanced: total.debit.eq(total.credit) && total.closingDebit.eq(total.closingCredit),
  };
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: JournalPostingService,
  ) {}

  async trialBalance(q: PeriodQueryDto) {
    await this.posting.sync();
    const p = ledgerPeriod(q);
    const [accounts, opening, period] = await Promise.all([
      this.prisma.account.findMany({
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, type: true, isPostable: true },
      }),
      p.start ? this.sums({ lt: p.start }) : Promise.resolve<Sums>(new Map()),
      this.sums({ ...(p.start && { gte: p.start }), lt: p.end }),
    ]);
    return { from: p.from, to: p.to, ...buildTrialBalance(accounts, opening, period) };
  }

  /** Buku besar satu akun: saldo awal, baris jurnal + saldo berjalan, saldo akhir. */
  async generalLedger(q: LedgerQueryDto) {
    await this.posting.sync();
    const account = await this.prisma.account.findUnique({
      where: { id: q.accountId },
      select: { id: true, code: true, name: true, type: true, isPostable: true },
    });
    if (!account) throw new NotFoundException('Akun tidak ditemukan');
    const p = ledgerPeriod(q);

    const [openingAgg, lines] = await Promise.all([
      p.start
        ? this.prisma.journalLine.aggregate({
            where: { accountId: account.id, entry: { date: { lt: p.start } } },
            _sum: { debit: true, credit: true },
          })
        : Promise.resolve(null),
      this.prisma.journalLine.findMany({
        where: { accountId: account.id, entry: { date: { ...(p.start && { gte: p.start }), lt: p.end } } },
        include: {
          entry: {
            select: {
              id: true,
              number: true,
              date: true,
              description: true,
              sourceType: true,
              sourceId: true,
              sourceNumber: true,
            },
          },
        },
        orderBy: [{ entry: { date: 'asc' } }, { entry: { number: 'asc' } }, { lineNo: 'asc' }],
      }),
    ]);

    const opening = signedBalance(account.type, D(openingAgg?._sum.debit), D(openingAgg?._sum.credit));
    let running = opening;
    let totalDebit = D(0);
    let totalCredit = D(0);
    const rows = lines.map((l) => {
      running = running.add(signedBalance(account.type, l.debit, l.credit));
      totalDebit = totalDebit.add(l.debit);
      totalCredit = totalCredit.add(l.credit);
      return {
        id: l.id,
        entryId: l.entry.id,
        number: l.entry.number,
        date: l.entry.date,
        description: l.description ?? l.entry.description,
        sourceType: l.entry.sourceType,
        sourceId: l.entry.sourceId,
        sourceNumber: l.entry.sourceNumber,
        debit: l.debit,
        credit: l.credit,
        balance: running,
      };
    });

    return {
      account,
      from: p.from,
      to: p.to,
      openingBalance: opening,
      totalDebit,
      totalCredit,
      closingBalance: running,
      rows,
    };
  }

  private async sums(date: Prisma.DateTimeFilter): Promise<Sums> {
    const groups = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { date } },
      _sum: { debit: true, credit: true },
    });
    return new Map(
      groups.map((g) => [g.accountId, { debit: D(g._sum.debit), credit: D(g._sum.credit) }]),
    );
  }
}
