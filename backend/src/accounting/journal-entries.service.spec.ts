import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { JournalSourceType, Role } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { JournalEntriesService } from './journal-entries.service.js';
import type { JournalPostingService } from './journal-posting.service.js';

describe('JournalEntriesService', () => {
  const user = { id: 'u1', email: 'admin@erp.local', role: Role.ADMIN };
  type M = ReturnType<typeof vi.fn>;
  let prisma: {
    $transaction: M;
    $queryRaw: M;
    $executeRaw: M;
    account: { findMany: M };
    journalEntry: { findFirst: M; findUnique: M; create: M };
  };
  let svc: JournalEntriesService;

  const line = (accountId: string, debit: number, credit: number) => ({ accountId, debit, credit });
  const dto = (lines = [line('a1', 100, 0), line('a2', 0, 100)]) => ({
    date: '2026-11-22',
    description: 'Setoran modal',
    lines,
  });

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(0),
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'a1', code: '1102', isPostable: true, isActive: true },
          { id: 'a2', code: '3100', isPostable: true, isActive: true },
        ]),
      },
      journalEntry: {
        findFirst: vi.fn().mockResolvedValue({ number: 'JV-20261122-0004' }),
        findUnique: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'new' }),
      },
    };
    svc = new JournalEntriesService(
      prisma as unknown as PrismaService,
      { sync: vi.fn() } as unknown as JournalPostingService,
    );
  });

  it('jurnal manual seimbang: nomor lanjut dari nomor terakhir hari itu, ambil advisory lock', async () => {
    prisma.journalEntry.findUnique.mockResolvedValue({ id: 'new', lines: [] });
    await svc.create(dto(), user);
    expect(prisma.$executeRaw).toHaveBeenCalled();
    const data = prisma.journalEntry.create.mock.calls[0][0].data;
    expect(data.number).toMatch(/^JV-\d{8}-0005$/);
    expect(data.sourceType).toBe(JournalSourceType.MANUAL);
    expect(data.createdById).toBe('u1');
    expect(data.lines.create).toHaveLength(2);
  });

  it('tolak jurnal tidak seimbang', async () => {
    await expect(svc.create(dto([line('a1', 100, 0), line('a2', 0, 90)]), user)).rejects.toThrow(
      /tidak seimbang/,
    );
  });

  it('tolak baris yang isi debit dan kredit sekaligus / dua-duanya 0', async () => {
    await expect(svc.create(dto([line('a1', 100, 100), line('a2', 0, 0)]), user)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('tolak akun header / tidak ditemukan', async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      { id: 'a1', code: '1000', isPostable: false, isActive: true },
      { id: 'a2', code: '3100', isPostable: true, isActive: true },
    ]);
    await expect(svc.create(dto(), user)).rejects.toThrow(/header/);
    prisma.account.findMany.mockResolvedValueOnce([{ id: 'a1', code: '1102', isPostable: true, isActive: true }]);
    await expect(svc.create(dto(), user)).rejects.toThrow(NotFoundException);
  });

  describe('reverse', () => {
    const entry = (over: Record<string, unknown> = {}) => ({
      id: 'e1',
      number: 'JV-1',
      description: 'Modal',
      sourceType: JournalSourceType.MANUAL,
      reversalOf: null,
      reversedBy: null,
      lines: [
        { accountId: 'a1', debit: new Prisma.Decimal(100), credit: new Prisma.Decimal(0) },
        { accountId: 'a2', debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(100) },
      ],
      ...over,
    });

    it('membuat jurnal pembalik dengan debit/kredit ditukar', async () => {
      prisma.journalEntry.findUnique.mockResolvedValue(entry());
      await svc.reverse('e1', user);
      const data = prisma.journalEntry.create.mock.calls[0][0].data;
      expect(data.reversalOfId).toBe('e1');
      expect(data.lines.create.map((l: { debit: Prisma.Decimal }) => l.debit.toNumber())).toEqual([0, 100]);
    });

    it('jurnal otomatis tidak bisa dibalik manual', async () => {
      prisma.journalEntry.findUnique.mockResolvedValue(entry({ sourceType: JournalSourceType.PAYMENT }));
      await expect(svc.reverse('e1', user)).rejects.toThrow(/otomatis/);
    });

    it('jurnal yang sudah dibalik ditolak', async () => {
      prisma.journalEntry.findUnique.mockResolvedValue(entry({ reversedBy: { id: 'r', number: 'JV-2' } }));
      await expect(svc.reverse('e1', user)).rejects.toThrow(/JV-2/);
    });
  });
});
