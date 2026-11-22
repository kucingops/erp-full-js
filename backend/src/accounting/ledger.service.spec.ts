import { Prisma } from '../generated/prisma/client.js';
import { AccountType } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { JournalPostingService } from './journal-posting.service.js';
import { buildTrialBalance, ledgerPeriod, LedgerService } from './ledger.service.js';

const D = (v: number) => new Prisma.Decimal(v);
const acc = (id: string, code: string, type: AccountType, isPostable = true) => ({
  id,
  code,
  name: code,
  type,
  isPostable,
});

describe('ledgerPeriod', () => {
  it('tanggal WIB inklusif → [start, end) UTC', () => {
    const p = ledgerPeriod({ from: '2026-11-01', to: '2026-11-30' });
    expect(p.start!.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-11-30T17:00:00.000Z');
  });

  it('tanpa from = sejak awal, tanpa to = hari ini WIB', () => {
    const p = ledgerPeriod({}, new Date('2026-11-22T20:00:00Z')); // 23 Nov 03:00 WIB
    expect(p.start).toBeNull();
    expect(p.to).toBe('2026-11-23');
  });
});

describe('buildTrialBalance', () => {
  const accounts = [
    acc('h', '1000', AccountType.ASSET, false),
    acc('bank', '1102', AccountType.ASSET),
    acc('cap', '3100', AccountType.EQUITY),
    acc('sales', '4100', AccountType.REVENUE),
    acc('unused', '6100', AccountType.EXPENSE),
  ];

  it('saldo awal + mutasi = saldo akhir, kolom D/K seimbang, header & akun kosong disembunyikan', () => {
    const opening = new Map([
      ['bank', { debit: D(1000), credit: D(0) }],
      ['cap', { debit: D(0), credit: D(1000) }],
    ]);
    const period = new Map([
      ['bank', { debit: D(300), credit: D(50) }],
      ['sales', { debit: D(50), credit: D(300) }],
    ]);
    const tb = buildTrialBalance(accounts, opening, period);
    expect(tb.rows.map((r) => r.code)).toEqual(['1102', '3100', '4100']);
    const bank = tb.rows[0];
    expect(bank.openingBalance.toNumber()).toBe(1000);
    expect(bank.closingBalance.toNumber()).toBe(1250);
    expect(bank.closingDebit.toNumber()).toBe(1250);
    const sales = tb.rows[2];
    expect(sales.closingBalance.toNumber()).toBe(250); // pendapatan: normal kredit
    expect(sales.closingCredit.toNumber()).toBe(250);
    expect(tb.total.closingDebit.toNumber()).toBe(1250);
    expect(tb.total.closingCredit.toNumber()).toBe(1250);
    expect(tb.balanced).toBe(true);
  });

  it('jurnal timpang terdeteksi (balanced=false)', () => {
    const tb = buildTrialBalance(accounts, new Map(), new Map([['bank', { debit: D(10), credit: D(0) }]]));
    expect(tb.balanced).toBe(false);
  });
});

describe('LedgerService.generalLedger', () => {
  it('saldo berjalan mengikuti saldo normal akun & sync dipanggil dulu', async () => {
    const entry = (n: string) => ({
      id: n,
      number: n,
      date: new Date(),
      description: 'x',
      sourceType: 'MANUAL',
      sourceId: null,
      sourceNumber: null,
    });
    const prisma = {
      account: { findUnique: vi.fn().mockResolvedValue(acc('bank', '1102', AccountType.ASSET)) },
      journalLine: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { debit: D(100), credit: D(40) } }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'l1', debit: D(50), credit: D(0), description: null, entry: entry('JV1') },
          { id: 'l2', debit: D(0), credit: D(30), description: 'bayar', entry: entry('JV2') },
        ]),
      },
    };
    const posting = { sync: vi.fn().mockResolvedValue({ ran: true, posted: 0, reversed: 0 }) };
    const svc = new LedgerService(prisma as unknown as PrismaService, posting as unknown as JournalPostingService);

    const gl = await svc.generalLedger({ accountId: 'bank', from: '2026-11-01', to: '2026-11-30' });
    expect(posting.sync).toHaveBeenCalled();
    expect(gl.openingBalance.toNumber()).toBe(60);
    expect(gl.rows.map((r) => r.balance.toNumber())).toEqual([110, 80]);
    expect(gl.closingBalance.toNumber()).toBe(80);
    expect(gl.rows[1].description).toBe('bayar');
  });
});
