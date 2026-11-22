import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockMovementType, StockReferenceType } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { InsufficientStockException } from './insufficient-stock.exception.js';
import { InventoryService } from './inventory.service.js';
import type { TxClient } from './inventory.types.js';

/**
 * Unit test murni: `tx` (transaction client) di-mock, tidak butuh database.
 * Yang dites: arah quantity, saldo `balanceAfter`, dan penolakan stok kurang.
 */
describe('InventoryService', () => {
  const base = { productId: 'p1', warehouseId: 'w1' };
  let tx: {
    stock: {
      upsert: ReturnType<typeof vi.fn>;
      updateManyAndReturn: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    stockMovement: { create: ReturnType<typeof vi.fn> };
  };
  let service: InventoryService;
  const asTx = () => tx as unknown as TxClient;

  beforeEach(() => {
    tx = {
      stock: { upsert: vi.fn(), updateManyAndReturn: vi.fn(), findUnique: vi.fn() },
      stockMovement: { create: vi.fn().mockImplementation(({ data }) => ({ id: 'm1', ...data })) },
    };
    service = new InventoryService(tx as unknown as PrismaService);
  });

  describe('receive', () => {
    it('menambah stok (upsert increment) dan mencatat movement IN', async () => {
      tx.stock.upsert.mockResolvedValue({ quantity: 15 });

      const m = await service.receive(asTx(), {
        ...base,
        quantity: 5,
        referenceType: StockReferenceType.PURCHASE_ORDER,
        referenceId: 'po1',
        createdById: 'u1',
      });

      expect(tx.stock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { ...base, quantity: 5 },
          update: { quantity: { increment: 5 } },
        }),
      );
      expect(m).toMatchObject({
        type: StockMovementType.IN,
        quantity: 5,
        balanceAfter: 15,
        referenceType: StockReferenceType.PURCHASE_ORDER,
        referenceId: 'po1',
        createdById: 'u1',
      });
    });

    it.each([0, -1, 1.5])('menolak quantity tidak valid (%s)', async (q) => {
      await expect(
        service.receive(asTx(), { ...base, quantity: q, referenceType: StockReferenceType.PURCHASE_ORDER }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.stock.upsert).not.toHaveBeenCalled();
    });
  });

  describe('issue', () => {
    it('mengurangi stok dengan decrement bersyarat dan mencatat quantity negatif', async () => {
      tx.stock.updateManyAndReturn.mockResolvedValue([{ quantity: 7 }]);

      const m = await service.issue(asTx(), {
        ...base,
        quantity: 3,
        referenceType: StockReferenceType.SALES_ORDER,
        referenceId: 'so1',
      });

      expect(tx.stock.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ...base, quantity: { gte: 3 } },
          data: { quantity: { decrement: 3 } },
        }),
      );
      expect(m).toMatchObject({ type: StockMovementType.OUT, quantity: -3, balanceAfter: 7 });
    });

    it('lempar InsufficientStockException kalau stok kurang, tanpa mencatat movement', async () => {
      tx.stock.updateManyAndReturn.mockResolvedValue([]);
      tx.stock.findUnique.mockResolvedValue({ quantity: 2 });

      const err = await service
        .issue(asTx(), { ...base, quantity: 5, referenceType: StockReferenceType.SALES_ORDER })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InsufficientStockException);
      expect(err).toMatchObject({ requested: 5, available: 2 });
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('stok belum pernah ada dianggap 0', async () => {
      tx.stock.updateManyAndReturn.mockResolvedValue([]);
      tx.stock.findUnique.mockResolvedValue(null);

      await expect(
        service.issue(asTx(), { ...base, quantity: 1, referenceType: StockReferenceType.SALES_ORDER }),
      ).rejects.toMatchObject({ available: 0 });
    });
  });

  describe('adjust', () => {
    it('adjust positif = increment, tipe ADJUSTMENT', async () => {
      tx.stock.upsert.mockResolvedValue({ quantity: 12 });

      const m = await service.adjust(asTx(), { ...base, quantity: 2, note: 'Stock opname' });

      expect(m).toMatchObject({
        type: StockMovementType.ADJUSTMENT,
        referenceType: StockReferenceType.ADJUSTMENT,
        quantity: 2,
        balanceAfter: 12,
        note: 'Stock opname',
      });
    });

    it('adjust bisa membawa referensi dokumen (mis. stock opname)', async () => {
      tx.stock.upsert.mockResolvedValue({ quantity: 3 });

      const m = await service.adjust(asTx(), {
        ...base,
        quantity: 3,
        note: 'OPN',
        referenceType: StockReferenceType.STOCK_OPNAME,
        referenceId: 'opn1',
      });

      expect(m).toMatchObject({
        type: StockMovementType.ADJUSTMENT,
        referenceType: StockReferenceType.STOCK_OPNAME,
        referenceId: 'opn1',
      });
    });

    it('adjust negatif = decrement, tetap dijaga tidak minus', async () => {
      tx.stock.updateManyAndReturn.mockResolvedValue([{ quantity: 8 }]);

      const m = await service.adjust(asTx(), { ...base, quantity: -2, note: 'Barang rusak' });

      expect(tx.stock.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({ data: { quantity: { decrement: 2 } } }),
      );
      expect(m).toMatchObject({ quantity: -2, balanceAfter: 8 });
    });

    it('adjust negatif melebihi stok ditolak', async () => {
      tx.stock.updateManyAndReturn.mockResolvedValue([]);
      tx.stock.findUnique.mockResolvedValue({ quantity: 1 });

      await expect(
        service.adjust(asTx(), { ...base, quantity: -5, note: 'x' }),
      ).rejects.toBeInstanceOf(InsufficientStockException);
    });

    it('menolak quantity 0', async () => {
      await expect(
        service.adjust(asTx(), { ...base, quantity: 0, note: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createAdjustment', () => {
    let prisma: {
      product: { findUnique: ReturnType<typeof vi.fn> };
      warehouse: { findUnique: ReturnType<typeof vi.fn> };
      $transaction: ReturnType<typeof vi.fn>;
    };
    const input = { ...base, quantity: 3, note: 'Koreksi', createdById: 'u1' };

    beforeEach(() => {
      prisma = {
        product: { findUnique: vi.fn().mockResolvedValue({ isActive: true }) },
        warehouse: { findUnique: vi.fn().mockResolvedValue({ isActive: true }) },
        // jalankan callback transaksi dengan tx mock
        $transaction: vi.fn().mockImplementation((fn: (t: TxClient) => unknown) => fn(asTx())),
      };
      service = new InventoryService(prisma as unknown as PrismaService);
    });

    it('membuka transaksi lalu memanggil adjust', async () => {
      tx.stock.upsert.mockResolvedValue({ quantity: 3 });
      const m = await service.createAdjustment(input);
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(m).toMatchObject({ type: StockMovementType.ADJUSTMENT, createdById: 'u1' });
    });

    it('404 kalau produk tidak ada', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.createAdjustment(input)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('400 kalau gudang nonaktif', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({ isActive: false });
      await expect(service.createAdjustment(input)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('getQuantity mengembalikan 0 kalau baris stok belum ada', async () => {
    tx.stock.findUnique.mockResolvedValue(null);
    await expect(service.getQuantity('p1', 'w1', asTx())).resolves.toBe(0);
  });
});
