import { StockMovementType } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MovementQueryDto, StockQueryDto } from './dto/inventory.dto.js';
import { InventoryQueryService } from './inventory-query.service.js';

describe('InventoryQueryService', () => {
  let prisma: {
    stock: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
    stockMovement: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
  };
  let service: InventoryQueryService;

  beforeEach(() => {
    prisma = {
      stock: { findMany: vi.fn(), count: vi.fn() },
      stockMovement: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      // $transaction([...promises]) versi array
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
      $queryRaw: vi.fn(),
    };
    service = new InventoryQueryService(prisma as unknown as PrismaService);
  });

  const q = <T extends object>(cls: new () => T, v: Partial<T>) => Object.assign(new cls(), v);

  it('findStocks menandai isLowStock dan membungkus { data, meta }', async () => {
    prisma.stock.findMany.mockResolvedValue([
      { id: 's1', quantity: 2, product: { minStock: 5 } },
      { id: 's2', quantity: 9, product: { minStock: 5 } },
    ]);
    prisma.stock.count.mockResolvedValue(2);

    const res = await service.findStocks(q(StockQueryDto, { search: 'kopi' }));

    expect(res.data.map((s) => s.isLowStock)).toEqual([true, false]);
    expect(res.meta).toEqual({ page: 1, limit: 10, total: 2, totalPages: 1 });
    const where = prisma.stock.findMany.mock.calls[0][0].where;
    expect(where.product.OR).toHaveLength(2);
  });

  it('findStocks lowStock memfilter id dari SQL mentah', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 's1' }]);
    prisma.stock.findMany.mockResolvedValue([]);
    prisma.stock.count.mockResolvedValue(0);

    await service.findStocks(q(StockQueryDto, { lowStock: true }));

    expect(prisma.stock.findMany.mock.calls[0][0].where.id).toEqual({ in: ['s1'] });
  });

  it('findMovements: filter tanggal dateTo inklusif sampai akhir hari', async () => {
    await service.findMovements(
      q(MovementQueryDto, {
        productId: 'p1',
        type: StockMovementType.OUT,
        dateFrom: new Date(2026, 10, 1),
        dateTo: new Date(2026, 10, 30),
      }),
    );

    const args = prisma.stockMovement.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ productId: 'p1', type: StockMovementType.OUT });
    expect(args.where.createdAt.lte.getHours()).toBe(23);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });
});
