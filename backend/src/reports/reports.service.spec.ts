import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { resolvePeriod, wibDateKey } from './report-period.js';
import { ReportsService, sumMoney } from './reports.service.js';

/**
 * Unit test tanpa database: $queryRaw di-mock (mirip Mockito).
 * Panggilan tagged template disusun ulang jadi Prisma.Sql supaya bisa dicek
 * teks SQL-nya dan nilai parameternya (memastikan input user jadi parameter, bukan string).
 */
function setup(...results: unknown[][]) {
  const queryRaw = vi.fn();
  for (const r of results) queryRaw.mockResolvedValueOnce(r);
  const service = new ReportsService({ $queryRaw: queryRaw } as unknown as PrismaService);
  const call = (i: number) => {
    const [strings, ...values] = queryRaw.mock.calls[i] as [TemplateStringsArray, ...unknown[]];
    return Prisma.sql(strings, ...values);
  };
  return { service, queryRaw, call };
}

const now = new Date('2026-11-15T05:00:00Z'); // 12:00 WIB

describe('resolvePeriod (WIB)', () => {
  it('default: awal bulan ini s/d hari ini (WIB)', () => {
    const p = resolvePeriod(undefined, undefined, now);
    expect(p).toMatchObject({ from: '2026-11-01', to: '2026-11-15' });
    expect(p.start.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-11-15T17:00:00.000Z');
  });

  it('jam 01:00 WIB tanggal 1 sudah dianggap tanggal 1, bukan bulan lalu', () => {
    expect(wibDateKey(new Date('2026-11-30T18:00:00Z'))).toBe('2026-12-01');
    expect(resolvePeriod(undefined, undefined, new Date('2026-11-30T18:00:00Z')).from).toBe(
      '2026-12-01',
    );
  });

  it('rentang satu hari = 24 jam half-open', () => {
    const p = resolvePeriod('2026-11-10', '2026-11-10', now);
    expect(p.end.getTime() - p.start.getTime()).toBe(24 * 3600 * 1000);
  });

  it('menolak from > to dan rentang terlalu panjang', () => {
    expect(() => resolvePeriod('2026-11-10', '2026-11-09', now)).toThrow(BadRequestException);
    expect(() => resolvePeriod('2020-01-01', '2026-11-09', now)).toThrow(/maksimal/);
  });
});

describe('ReportsService.sales / purchases', () => {
  const row = { key: '2026-11', label: '2026-11', code: null, orderCount: 2, quantity: 5, total: '150000.00' };
  const totals = { orderCount: 2, quantity: 5, total: '150000.00' };

  it('default status = CONFIRMED + SHIPPED dan grup per bulan', async () => {
    const { service, call } = setup([row], [totals]);
    const res = await service.sales({ groupBy: 'month' }, now);

    expect(res).toEqual({
      from: '2026-11-01',
      to: '2026-11-15',
      groupBy: 'month',
      statuses: ['CONFIRMED', 'SHIPPED'],
      rows: [row],
      totals,
    });
    const q = call(0);
    expect(q.sql).toContain('FROM sales_orders o');
    expect(q.sql).toContain("'YYYY-MM'");
    expect(q.sql).toContain("AT TIME ZONE 'Asia/Jakarta'");
    expect(q.values).toEqual(expect.arrayContaining(['CONFIRMED', 'SHIPPED']));
  });

  it('filter customer & status jadi parameter; grup customer diurut omzet', async () => {
    const { service, call } = setup([], [totals]);
    const customerId = '7c1b6a9e-2f7e-4a43-9f4e-0b8f0f6a1c11';
    await service.sales({ groupBy: 'partner', customerId, status: 'SHIPPED' }, now);

    const q = call(0);
    expect(q.text).toMatch(/pt\.id = \$\d+/);
    expect(q.sql).toContain('SUM(i.subtotal) DESC');
    expect(q.values).toContain(customerId);
    expect(q.values).toContain('SHIPPED');
    expect(q.values).not.toContain('CONFIRMED');
  });

  it('pembelian memakai tabel purchase + status APPROVED/RECEIVED', async () => {
    const { service, call } = setup([], []);
    const res = await service.purchases({ groupBy: 'product' }, now);

    const q = call(0);
    expect(q.sql).toContain('FROM purchase_orders o');
    expect(q.sql).toContain('JOIN suppliers pt ON pt.id = o.supplier_id');
    expect(q.values).toEqual(expect.arrayContaining(['APPROVED', 'RECEIVED']));
    // totals kosong tetap punya bentuk default
    expect(res.totals).toEqual({ orderCount: 0, quantity: 0, total: '0' });
  });
});

describe('ReportsService.stockValuation', () => {
  it('total qty & nilai dijumlah dengan Decimal', async () => {
    const rows = [
      { productId: 'a', sku: 'A', name: 'A', unit: 'pcs', category: null, quantity: 3, costPrice: '0.10', value: '0.30' },
      { productId: 'b', sku: 'B', name: 'B', unit: 'pcs', category: null, quantity: 7, costPrice: '0.20', value: '1.40' },
    ];
    const { service, call } = setup(rows);
    const res = await service.stockValuation({ search: ' kopi ' }, now);

    expect(res.totals).toEqual({ quantity: 10, value: '1.70' });
    expect(res.asOf).toBe(now.toISOString());
    expect(call(0).values).toEqual(['%kopi%', '%kopi%']);
  });
});

describe('ReportsService.stockMovements', () => {
  it('menghitung total kolom dan memakai batas periode WIB', async () => {
    const rows = [
      { productId: 'a', sku: 'A', name: 'A', unit: 'pcs', opening: 10, inQty: 5, outQty: 3, adjustment: -1, closing: 11 },
      { productId: 'b', sku: 'B', name: 'B', unit: 'pcs', opening: 0, inQty: 2, outQty: 0, adjustment: 0, closing: 2 },
    ];
    const { service, call } = setup(rows);
    const res = await service.stockMovements({ from: '2026-11-01', to: '2026-11-10' }, now);

    expect(res.totals).toEqual({ opening: 10, inQty: 7, outQty: 3, adjustment: -1, closing: 13 });
    const values = call(0).values as unknown[];
    expect(values).toContainEqual(new Date('2026-10-31T17:00:00Z'));
    expect(values).toContainEqual(new Date('2026-11-10T17:00:00Z'));
  });
});

describe('sumMoney', () => {
  it('tidak kena error floating point', () => {
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30');
    expect(sumMoney([])).toBe('0.00');
  });
});
