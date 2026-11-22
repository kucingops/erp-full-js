import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client.js';
import { AccountType, InvoiceType, PaymentMethod } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SYSTEM_ACCOUNTS } from './chart-of-accounts.js';
import { JournalPostingService } from './journal-posting.service.js';

/**
 * Sync diuji dengan Prisma mock: `$queryRaw` dipanggil berurutan
 * (lock, invoice, payment, stok, orphan), jadi mock-nya pakai urutan yang sama.
 */
describe('JournalPostingService.sync', () => {
  type M = ReturnType<typeof vi.fn>;
  let prisma: {
    $transaction: M;
    $queryRaw: M;
    account: { findMany: M; upsert: M };
    invoice: { findMany: M };
    payment: { findMany: M };
    stockMovement: { findMany: M };
    purchaseOrder: { findMany: M };
    salesOrder: { findMany: M };
    journalEntry: { findFirst: M; findMany: M; create: M };
  };
  let svc: JournalPostingService;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
      $queryRaw: vi.fn(),
      account: {
        findMany: vi.fn().mockResolvedValue(
          SYSTEM_ACCOUNTS.map((a) => ({ id: `id-${a.code}`, code: a.code, isSystem: true, type: AccountType.ASSET })),
        ),
        upsert: vi.fn(),
      },
      invoice: { findMany: vi.fn().mockResolvedValue([]) },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
      stockMovement: { findMany: vi.fn().mockResolvedValue([]) },
      purchaseOrder: { findMany: vi.fn().mockResolvedValue([]) },
      salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
      journalEntry: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    svc = new JournalPostingService(prisma as unknown as PrismaService, new ConfigService({}));
  });

  it('lewati kalau sync lain sedang pegang lock', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: false }]);
    await expect(svc.sync()).resolves.toEqual({ ran: false, posted: 0, reversed: 0 });
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  it('posting invoice & payment yang belum dijurnal, urut tanggal, akun via kode', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ ok: true }])
      .mockResolvedValueOnce([{ id: 'inv1' }])
      .mockResolvedValueOnce([{ id: 'pay1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.invoice.findMany.mockResolvedValue([
      {
        id: 'inv1',
        number: 'INV-1',
        type: InvoiceType.SALES,
        issueDate: new Date('2026-11-01'),
        totalAmountBase: new Prisma.Decimal(1000),
        customer: { name: 'PT A' },
        supplier: null,
      },
    ]);
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'pay1',
        amount: new Prisma.Decimal(400),
        amountBase: new Prisma.Decimal(400),
        paidAt: new Date('2026-11-05'),
        method: PaymentMethod.CASH,
        reference: null,
        invoice: { number: 'INV-1', type: InvoiceType.SALES, exchangeRate: new Prisma.Decimal(1) },
      },
    ]);

    await expect(svc.sync()).resolves.toEqual({ ran: true, posted: 2, reversed: 0 });
    const calls = prisma.journalEntry.create.mock.calls.map((c) => c[0].data);
    expect(calls.map((d) => d.sourceKey)).toEqual(['INVOICE:inv1', 'PAYMENT:pay1']);
    expect(calls.map((d) => d.number.slice(-4))).toEqual(['0001', '0002']);
    expect(calls[1].lines.create[0].accountId).toBe('id-1101'); // CASH → Kas
  });

  it('jurnal yang dokumennya dihapus dibalik', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ ok: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'j1' }]);
    prisma.journalEntry.findMany.mockResolvedValue([
      {
        id: 'j1',
        description: 'Penerimaan INV-1',
        sourceType: 'PAYMENT',
        sourceId: 'pay1',
        sourceNumber: 'INV-1',
        sourceKey: 'PAYMENT:pay1',
        lines: [
          { accountId: 'id-1102', debit: new Prisma.Decimal(5), credit: new Prisma.Decimal(0), description: null },
          { accountId: 'id-1200', debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(5), description: null },
        ],
      },
    ]);

    await expect(svc.sync()).resolves.toEqual({ ran: true, posted: 0, reversed: 1 });
    const data = prisma.journalEntry.create.mock.calls[0][0].data;
    expect(data.sourceKey).toBe('PAYMENT:pay1:REV');
    expect(data.reversalOfId).toBe('j1');
    expect(data.lines.create[0]).toMatchObject({ accountId: 'id-1102' });
    expect(data.lines.create[0].credit.toNumber()).toBe(5);
  });

  it('tidak ada yang perlu diposting → tidak menulis apa pun', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ ok: true }]).mockResolvedValue([]);
    await expect(svc.sync()).resolves.toEqual({ ran: true, posted: 0, reversed: 0 });
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });
});
