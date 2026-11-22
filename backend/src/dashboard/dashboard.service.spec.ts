import { Role } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { dashboardScope } from './dashboard-scope.js';
import { DashboardService } from './dashboard.service.js';
import { fillMonths, lastMonthKeys, monthKey, monthStart } from './month-buckets.js';

/** Unit test: Prisma di-mock (mirip Mockito), tidak butuh database. */
describe('month-buckets (WIB)', () => {
  // 2026-11-30 20:00 UTC = 2026-12-01 03:00 WIB → sudah masuk Desember
  const lateNovUtc = new Date('2026-11-30T20:00:00Z');

  it('monthKey memakai zona WIB, bukan UTC', () => {
    expect(monthKey(lateNovUtc)).toBe('2026-12');
    expect(monthKey(new Date('2026-11-30T16:00:00Z'))).toBe('2026-11'); // 23:00 WIB
  });

  it('monthStart = 00:00 WIB tanggal 1, termasuk geser tahun', () => {
    expect(monthStart(lateNovUtc).toISOString()).toBe('2026-11-30T17:00:00.000Z');
    expect(monthStart(lateNovUtc, 1).toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(monthStart(lateNovUtc, -12).toISOString()).toBe('2025-11-30T17:00:00.000Z');
  });

  it('lastMonthKeys urut dari paling lama', () => {
    expect(lastMonthKeys(new Date('2026-02-10T00:00:00Z'), 4)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('fillMonths mengisi bulan kosong', () => {
    const rows = fillMonths(['2026-01', '2026-02'], [{ month: '2026-02', total: '5' }], {
      total: '0',
    });
    expect(rows).toEqual([
      { month: '2026-01', total: '0' },
      { month: '2026-02', total: '5' },
    ]);
  });
});

describe('dashboardScope', () => {
  it.each([
    [Role.ADMIN, { sales: true, purchases: true, customers: true, suppliers: true, users: true }],
    [Role.SALES, { sales: true, purchases: false, customers: true, suppliers: false, users: false }],
    [Role.PURCHASING, { sales: false, purchases: true, customers: false, suppliers: true, users: false }],
    [Role.WAREHOUSE, { sales: true, purchases: true, customers: false, suppliers: false, users: false }],
  ])('%s sesuai matriks role', (role, expected) => {
    expect(dashboardScope(role)).toEqual({ ...expected, inventory: true });
  });
});

describe('DashboardService', () => {
  const now = new Date('2026-11-15T05:00:00Z');
  const decimal = (v: string) => ({ toString: () => v });

  const model = () => ({
    aggregate: vi.fn(),
    groupBy: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  });
  let prisma: Record<string, ReturnType<typeof model>> & { $queryRaw: ReturnType<typeof vi.fn> };
  let service: DashboardService;

  beforeEach(() => {
    prisma = {
      salesOrder: model(),
      purchaseOrder: model(),
      product: model(),
      warehouse: model(),
      customer: model(),
      supplier: model(),
      user: model(),
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    for (const m of [prisma.salesOrder, prisma.purchaseOrder]) {
      m.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmountBase: decimal('1500000') }, _count: 3 })
        .mockResolvedValueOnce({ _sum: { totalAmountBase: null } });
    }
    service = new DashboardService(prisma as unknown as PrismaService);
  });

  describe('summary', () => {
    it('ADMIN dapat semua bagian, angka uang sebagai string', async () => {
      prisma.salesOrder.groupBy.mockResolvedValue([{ status: 'DRAFT', _count: 2 }]);
      prisma.user.count.mockResolvedValue(4);
      prisma.$queryRaw.mockResolvedValue([
        { id: 'p1', sku: 'A', name: 'A', unit: 'pcs', minStock: 10, totalStock: 1, totalCount: 7 },
      ]);

      const res = await service.summary(Role.ADMIN, now);

      expect(res.month).toBe('2026-11');
      expect(res.sales).toEqual({
        total: '1500000',
        previousTotal: '0',
        orderCount: 3,
        byStatus: { DRAFT: 2, CONFIRMED: 0, SHIPPED: 0, CANCELLED: 0 },
      });
      expect(res.purchases?.total).toBe('1500000');
      expect(res.inventory).toEqual({ lowStockCount: 7 });
      expect(res.counts.users).toBe(4);
    });

    it('filter bulan ini memakai batas WIB dan hanya status yang dihitung', async () => {
      await service.summary(Role.SALES, now);
      expect(prisma.salesOrder.aggregate.mock.calls[0][0].where).toEqual({
        status: { in: ['CONFIRMED', 'SHIPPED'] },
        orderDate: {
          gte: new Date('2026-10-31T17:00:00Z'),
          lt: new Date('2026-11-30T17:00:00Z'),
        },
      });
    });

    it('SALES tidak melihat pembelian, supplier, user (dan query-nya tidak dijalankan)', async () => {
      const res = await service.summary(Role.SALES, now);

      expect(res.purchases).toBeNull();
      expect(res.counts).toMatchObject({ suppliers: null, users: null, customers: 0 });
      expect(prisma.purchaseOrder.aggregate).not.toHaveBeenCalled();
      expect(prisma.supplier.count).not.toHaveBeenCalled();
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('PURCHASING tidak melihat penjualan dan customer', async () => {
      const res = await service.summary(Role.PURCHASING, now);
      expect(res.sales).toBeNull();
      expect(res.counts.customers).toBeNull();
      expect(res.counts.suppliers).toBe(0);
      expect(prisma.salesOrder.aggregate).not.toHaveBeenCalled();
    });

    it('lowStockCount 0 kalau tidak ada produk menipis', async () => {
      const res = await service.summary(Role.WAREHOUSE, now);
      expect(res.inventory).toEqual({ lowStockCount: 0 });
    });
  });

  describe('trend', () => {
    it('mengisi bulan kosong dengan 0 dan menggabungkan sales + purchases', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ month: '2026-10', total: '200', count: 2 }]) // sales
        .mockResolvedValueOnce([{ month: '2026-11', total: '50', count: 1 }]); // purchases

      const res = await service.trend(Role.WAREHOUSE, 3, now);

      expect(res).toEqual([
        { month: '2026-09', sales: '0', salesCount: 0, purchases: '0', purchasesCount: 0 },
        { month: '2026-10', sales: '200', salesCount: 2, purchases: '0', purchasesCount: 0 },
        { month: '2026-11', sales: '0', salesCount: 0, purchases: '50', purchasesCount: 1 },
      ]);
      // parameter tanggal = awal bulan paling lama (WIB)
      expect(prisma.$queryRaw.mock.calls[0][1]).toEqual(new Date('2026-08-31T17:00:00Z'));
    });

    it('SALES hanya dapat field sales', async () => {
      const res = await service.trend(Role.SALES, 2, now);
      expect(prisma.$queryRaw).toHaveBeenCalledOnce();
      expect(res[0]).toEqual({ month: '2026-10', sales: '0', salesCount: 0 });
    });
  });

  describe('lowStock', () => {
    it('membuang kolom totalCount dari item dan meneruskan limit', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: 'p1', sku: 'A', name: 'A', unit: 'pcs', minStock: 10, totalStock: 0, totalCount: 1 },
      ]);
      const res = await service.lowStock(5);
      expect(res).toEqual([{ id: 'p1', sku: 'A', name: 'A', unit: 'pcs', minStock: 10, totalStock: 0 }]);
      expect(prisma.$queryRaw.mock.calls[0][1]).toBe(5);
    });
  });
});
