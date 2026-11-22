import { ConflictException } from '@nestjs/common';
import { Role, StockOpnameStatus, StockReferenceType } from '../generated/prisma/enums.js';
import { InsufficientStockException, type InventoryService } from '../inventory/index.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { StockOpnamesService } from './stock-opnames.service.js';

/** Unit test: Prisma & InventoryService di-mock. Fokus: snapshot, state machine, posting variance. */
describe('StockOpnamesService', () => {
  const user = { id: 'u-wh', email: 'wh@erp.local', role: Role.WAREHOUSE };
  const base = {
    id: 'opn1',
    number: 'OPN-20261123-0001',
    warehouseId: 'wh1',
    status: StockOpnameStatus.DRAFT as StockOpnameStatus,
    lines: [] as unknown[],
  };

  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    warehouse: { findUnique: ReturnType<typeof vi.fn> };
    product: { findMany: ReturnType<typeof vi.fn> };
    stock: { findMany: ReturnType<typeof vi.fn> };
    stockOpname: Record<
      'findMany' | 'count' | 'findUnique' | 'findFirst' | 'create' | 'update' | 'updateMany',
      ReturnType<typeof vi.fn>
    >;
    stockOpnameLine: Record<'findMany' | 'updateMany' | 'update', ReturnType<typeof vi.fn>>;
  };
  let inventory: { adjust: ReturnType<typeof vi.fn>; getQuantity: ReturnType<typeof vi.fn> };
  let service: StockOpnamesService;

  const withStatus = (status: StockOpnameStatus) => {
    let current = { ...base, status };
    prisma.stockOpname.findUnique.mockImplementation(() => Promise.resolve(current));
    prisma.stockOpname.updateMany.mockImplementation(
      ({ where, data }: { where: { status: { in: StockOpnameStatus[] } }; data: object }) => {
        if (!where.status.in.includes(current.status)) return Promise.resolve({ count: 0 });
        current = { ...current, ...data };
        return Promise.resolve({ count: 1 });
      },
    );
  };

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn((arg: unknown) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]),
      ),
      warehouse: { findUnique: vi.fn().mockResolvedValue({ isActive: true }) },
      product: { findMany: vi.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]) },
      stock: { findMany: vi.fn().mockResolvedValue([]) },
      stockOpname: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue(base),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'opn1' }),
        update: vi.fn().mockResolvedValue(base),
        updateMany: vi.fn(),
      },
      stockOpnameLine: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    inventory = { adjust: vi.fn().mockResolvedValue({}), getQuantity: vi.fn().mockResolvedValue(0) };
    service = new StockOpnamesService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
    );
  });

  describe('create (snapshot)', () => {
    it('snapshot qty sistem tiap produk; produk tanpa baris stok = 0', async () => {
      // findFirst pertama: cek draft terbuka; berikutnya: nomor terakhir
      prisma.stockOpname.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prisma.stock.findMany.mockResolvedValueOnce([
        { productId: 'p1', quantity: 10 },
        { productId: 'p2', quantity: 4 },
      ]);
      await service.create({ warehouseId: 'wh1' }, user);
      const data = prisma.stockOpname.create.mock.calls[0][0].data;
      expect(data.number).toMatch(/^OPN-\d{8}-0001$/);
      expect(data.lines.create).toEqual([
        { productId: 'p1', systemQty: 10 },
        { productId: 'p2', systemQty: 4 },
        { productId: 'p3', systemQty: 0 },
      ]);
    });

    it('filter kategori diteruskan ke query produk', async () => {
      await service.create({ warehouseId: 'wh1', categoryId: 'cat1' }, user);
      expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({
        isActive: true,
        categoryId: 'cat1',
      });
    });

    it('tolak kalau gudang masih punya opname DRAFT', async () => {
      prisma.stockOpname.findFirst.mockResolvedValueOnce({ number: 'OPN-20261122-0001' });
      await expect(service.create({ warehouseId: 'wh1' }, user)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('tolak productIds yang tidak valid', async () => {
      prisma.product.findMany.mockResolvedValue([{ id: 'p1' }]);
      await expect(
        service.create({ warehouseId: 'wh1', productIds: ['p1', 'pX'] }, user),
      ).rejects.toThrow('tidak ditemukan');
    });
  });

  describe('update (isi lembar hitung)', () => {
    it('set countedQty per produk', async () => {
      withStatus(StockOpnameStatus.DRAFT);
      await service.update('opn1', { lines: [{ productId: 'p1', countedQty: 8 }] });
      expect(prisma.stockOpnameLine.updateMany).toHaveBeenCalledWith({
        where: { stockOpnameId: 'opn1', productId: 'p1' },
        data: { countedQty: 8 },
      });
    });

    it('tolak produk di luar lembar hitung', async () => {
      withStatus(StockOpnameStatus.DRAFT);
      prisma.stockOpnameLine.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.update('opn1', { lines: [{ productId: 'pX', countedQty: 1 }] }),
      ).rejects.toThrow('tidak ada di lembar hitung');
    });

    it('POSTED tidak bisa diubah', async () => {
      withStatus(StockOpnameStatus.POSTED);
      await expect(service.update('opn1', { notes: 'x' })).rejects.toThrow('DRAFT');
    });
  });

  describe('post', () => {
    const lines = [
      { id: 'l1', productId: 'p1', systemQty: 10, countedQty: 8 }, // -2
      { id: 'l2', productId: 'p2', systemQty: 4, countedQty: 4 }, // 0
      { id: 'l3', productId: 'p3', systemQty: 0, countedQty: 3 }, // +3
    ];

    it('hanya variance ≠ 0 yang jadi adjustment, dengan referensi opname', async () => {
      withStatus(StockOpnameStatus.DRAFT);
      prisma.stockOpnameLine.findMany.mockResolvedValue(lines);
      await service.post('opn1', user);
      expect(inventory.adjust).toHaveBeenCalledTimes(2);
      expect(inventory.adjust.mock.calls[0][1]).toMatchObject({
        productId: 'p1',
        warehouseId: 'wh1',
        quantity: -2,
        referenceType: StockReferenceType.STOCK_OPNAME,
        referenceId: 'opn1',
      });
      expect(inventory.adjust.mock.calls[1][1]).toMatchObject({ productId: 'p3', quantity: 3 });
      expect(prisma.stockOpname.updateMany.mock.calls[0][0].data.status).toBe(
        StockOpnameStatus.POSTED,
      );
    });

    it('movement setelah snapshot tetap dihormati: delta diterapkan ke saldo saat ini', async () => {
      withStatus(StockOpnameStatus.DRAFT);
      // snapshot 10, hitung 8 (-2); setelah snapshot ada PO receive +5 ⇒ saldo sekarang 15
      prisma.stockOpnameLine.findMany.mockResolvedValue([lines[0]]);
      inventory.getQuantity.mockResolvedValue(15);
      await service.post('opn1', user);
      // yang dibukukan tetap -2 (hasil akhir 13), BUKAN -7 (paksa jadi 8)
      expect(inventory.adjust.mock.calls[0][1].quantity).toBe(-2);
      expect(prisma.stockOpnameLine.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { variance: -2, qtyAtPost: 15 },
      });
    });

    it('tolak kalau masih ada baris belum dihitung', async () => {
      withStatus(StockOpnameStatus.DRAFT);
      prisma.stockOpnameLine.findMany.mockResolvedValue([
        lines[0],
        { ...lines[1], countedQty: null },
      ]);
      await expect(service.post('opn1', user)).rejects.toThrow('1 produk yang belum dihitung');
      expect(inventory.adjust).not.toHaveBeenCalled();
    });

    it('stok saat ini tidak cukup untuk variance negatif ⇒ InsufficientStock (rollback)', async () => {
      withStatus(StockOpnameStatus.DRAFT);
      prisma.stockOpnameLine.findMany.mockResolvedValue([lines[0]]);
      inventory.getQuantity.mockResolvedValue(1);
      inventory.adjust.mockRejectedValue(new InsufficientStockException('p1', 'wh1', 2, 1));
      await expect(service.post('opn1', user)).rejects.toBeInstanceOf(InsufficientStockException);
    });

    it('tidak bisa post dua kali', async () => {
      withStatus(StockOpnameStatus.POSTED);
      await expect(service.post('opn1', user)).rejects.toThrow('aksi hanya untuk status DRAFT');
      expect(inventory.adjust).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('DRAFT → CANCELLED tanpa efek stok', async () => {
      withStatus(StockOpnameStatus.DRAFT);
      await service.cancel('opn1');
      expect(prisma.stockOpname.updateMany.mock.calls[0][0].data.status).toBe(
        StockOpnameStatus.CANCELLED,
      );
      expect(inventory.adjust).not.toHaveBeenCalled();
    });

    it('POSTED tidak bisa dibatalkan', async () => {
      withStatus(StockOpnameStatus.POSTED);
      await expect(service.cancel('opn1')).rejects.toThrow('DRAFT');
    });
  });
});
