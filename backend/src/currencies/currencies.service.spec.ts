import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import { Prisma } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CurrenciesController, ExchangeRatesController } from './currencies.controller.js';
import { CurrenciesService } from './currencies.service.js';

describe('CurrenciesService', () => {
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    currency: Record<'findMany' | 'count' | 'findUnique' | 'create' | 'update' | 'delete', ReturnType<typeof vi.fn>>;
    exchangeRate: Record<
      'findMany' | 'count' | 'findFirst' | 'findUnique' | 'upsert' | 'update' | 'delete',
      ReturnType<typeof vi.fn>
    >;
  };
  let service: CurrenciesService;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn((arg: Promise<unknown>[]) => Promise.all(arg)),
      currency: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue({ isActive: true }),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      exchangeRate: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    service = new CurrenciesService(prisma as unknown as PrismaService);
  });

  describe('getRate', () => {
    it('base currency (IDR) selalu 1 tanpa query', async () => {
      expect((await service.getRate('IDR', new Date())).toString()).toBe('1');
      expect(prisma.exchangeRate.findFirst).not.toHaveBeenCalled();
    });

    it('ambil kurs terbaru dengan effectiveDate <= tanggal WIB', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue({ rate: new Prisma.Decimal('15900.5') });
      // 21 Nov 20:00 UTC = 22 Nov 03:00 WIB → pakai kurs s/d 22 Nov
      const rate = await service.getRate('USD', new Date('2026-11-21T20:00:00Z'));
      expect(rate.toString()).toBe('15900.5');
      expect(prisma.exchangeRate.findFirst).toHaveBeenCalledWith({
        where: { currencyCode: 'USD', effectiveDate: { lte: new Date('2026-11-22T00:00:00Z') } },
        orderBy: { effectiveDate: 'desc' },
        select: { rate: true },
      });
    });

    it('400 kalau belum ada kurs', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(null);
      await expect(service.getRate('USD', new Date('2026-11-22T03:00:00Z'))).rejects.toThrow(
        'Belum ada kurs USD untuk tanggal 2026-11-22',
      );
    });
  });

  describe('snapshot', () => {
    const date = new Date('2026-11-22T03:00:00Z');

    it('urutan: requested → partnerDefault → IDR', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue({ rate: new Prisma.Decimal(16000) });
      expect((await service.snapshot({ date })).currencyCode).toBe('IDR');
      expect((await service.snapshot({ date, partnerDefault: 'USD' })).currencyCode).toBe('USD');
      expect((await service.snapshot({ date, requested: 'SGD', partnerDefault: 'USD' })).currencyCode).toBe('SGD');
    });

    it('IDR mengabaikan kurs manual (selalu 1)', async () => {
      const s = await service.snapshot({ date, requested: 'IDR', override: 2 });
      expect(s.exchangeRate.toString()).toBe('1');
    });

    it('kurs manual dipakai tanpa lookup tabel kurs', async () => {
      const s = await service.snapshot({ date, requested: 'USD', override: 15000.123456 });
      expect(s.exchangeRate.toString()).toBe('15000.123456');
      expect(prisma.exchangeRate.findFirst).not.toHaveBeenCalled();
    });

    it('400 kalau mata uang tidak terdaftar', async () => {
      prisma.currency.findUnique.mockResolvedValue(null);
      await expect(service.snapshot({ date, requested: 'XXX' })).rejects.toThrow('tidak terdaftar');
    });
  });

  describe('master & kurs', () => {
    it('base currency tidak boleh dihapus / dinonaktifkan', async () => {
      prisma.currency.findUnique.mockResolvedValue({ id: 'c1', code: 'IDR' });
      await expect(service.remove('c1')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update('c1', { isActive: false })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.currency.delete).not.toHaveBeenCalled();
    });

    it('404 kalau mata uang tidak ada', async () => {
      prisma.currency.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('upsertRate: satu kurs per (mata uang, tanggal)', async () => {
      await service.upsertRate({ currencyCode: 'USD', effectiveDate: '2026-11-22', rate: 15850.5 });
      const args = prisma.exchangeRate.upsert.mock.calls[0][0];
      expect(args.where).toEqual({
        currencyCode_effectiveDate: {
          currencyCode: 'USD',
          effectiveDate: new Date('2026-11-22T00:00:00Z'),
        },
      });
      expect(args.update.rate.toString()).toBe('15850.5');
    });

    it('upsertRate menolak kurs untuk IDR', async () => {
      await expect(
        service.upsertRate({ currencyCode: 'IDR', effectiveDate: '2026-11-22', rate: 1 }),
      ).rejects.toThrow('selalu 1');
    });

    it('convert silang USD → SGD lewat IDR', async () => {
      prisma.exchangeRate.findFirst
        .mockResolvedValueOnce({ rate: new Prisma.Decimal(16000) })
        .mockResolvedValueOnce({ rate: new Prisma.Decimal(12000) });
      const res = await service.convert({ amount: 30, from: 'USD', to: 'SGD', date: '2026-11-22' });
      expect(res.result).toBe('40');
    });

    it('list menandai base + kurs terakhir', async () => {
      prisma.currency.findMany.mockResolvedValue([{ code: 'IDR' }, { code: 'USD' }]);
      prisma.currency.count.mockResolvedValue(2);
      prisma.exchangeRate.findMany.mockResolvedValue([
        { currencyCode: 'USD', rate: new Prisma.Decimal(16000), effectiveDate: new Date('2026-11-22') },
      ]);
      const res = await service.findAll({ page: 1, limit: 10, sortOrder: 'asc' });
      expect(res.data[0]).toMatchObject({ isBase: true, latestRate: { rate: '1' } });
      expect(res.data[1]).toMatchObject({ isBase: false, latestRate: { rate: '16000' } });
    });
  });

  it('RBAC: baca semua role, tulis ADMIN', () => {
    const roles = (ctrl: object, m: string) =>
      Reflect.getMetadata(ROLES_KEY, (ctrl as { prototype: Record<string, object> }).prototype[m]) as
        | Role[]
        | undefined;
    for (const ctrl of [CurrenciesController, ExchangeRatesController]) {
      expect(roles(ctrl, 'findAll')).toBeUndefined();
      for (const m of ['create', 'update', 'remove']) expect(roles(ctrl, m)).toEqual([Role.ADMIN]);
    }
  });
});
