import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role, StockReferenceType, StockTransferStatus } from '../generated/prisma/enums.js';
import { InsufficientStockException, type InventoryService } from '../inventory/index.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { StockTransfersService } from './stock-transfers.service.js';

/**
 * Unit test: Prisma & InventoryService di-mock (mirip Mockito).
 * `$transaction(fn)` menjalankan callback dengan mock yang sama sebagai `tx`.
 * Yang dites: state machine + efek stok (lewat InventoryService) tiap transisi.
 */
describe('StockTransfersService', () => {
  const user = { id: 'u-wh', email: 'wh@erp.local', role: Role.WAREHOUSE };
  const base = {
    id: 'trf1',
    number: 'TRF-20261123-0001',
    fromWarehouseId: 'whA',
    toWarehouseId: 'whB',
    status: StockTransferStatus.DRAFT as StockTransferStatus,
    toWarehouse: { id: 'whB', code: 'WH-B', name: 'Gudang B' },
  };
  const items = [
    { id: 'i1', productId: 'p1', quantity: 5, receivedQuantity: null },
    { id: 'i2', productId: 'p2', quantity: 3, receivedQuantity: null },
  ];

  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    warehouse: { count: ReturnType<typeof vi.fn> };
    product: { count: ReturnType<typeof vi.fn> };
    stockTransfer: Record<
      'findMany' | 'count' | 'findUnique' | 'findFirst' | 'create' | 'update' | 'updateMany' | 'delete',
      ReturnType<typeof vi.fn>
    >;
    stockTransferItem: Record<'findMany' | 'deleteMany' | 'update', ReturnType<typeof vi.fn>>;
  };
  let inventory: { issue: ReturnType<typeof vi.fn>; receive: ReturnType<typeof vi.fn> };
  let service: StockTransfersService;

  /** Simulasikan status dokumen di DB: updateMany hanya berhasil kalau status cocok. */
  const withStatus = (status: StockTransferStatus) => {
    let current = { ...base, status };
    prisma.stockTransfer.findUnique.mockImplementation(() => Promise.resolve(current));
    prisma.stockTransfer.updateMany.mockImplementation(
      ({ where, data }: { where: { status: { in: StockTransferStatus[] } }; data: object }) => {
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
      warehouse: { count: vi.fn().mockResolvedValue(2) },
      product: { count: vi.fn().mockResolvedValue(2) },
      stockTransfer: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn((args: { data: object }) => Promise.resolve({ id: 'trf1', ...args.data })),
        update: vi.fn().mockResolvedValue(base),
        updateMany: vi.fn(),
        delete: vi.fn().mockResolvedValue(base),
      },
      stockTransferItem: {
        findMany: vi.fn().mockResolvedValue(items),
        deleteMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    inventory = { issue: vi.fn().mockResolvedValue({}), receive: vi.fn().mockResolvedValue({}) };
    service = new StockTransfersService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
    );
  });

  describe('create', () => {
    const dto = {
      fromWarehouseId: 'whA',
      toWarehouseId: 'whB',
      transferDate: '2026-11-23',
      items: [
        { productId: 'p1', quantity: 5 },
        { productId: 'p2', quantity: 3 },
      ],
    };

    it('nomor TRF-YYYYMMDD-XXXX lanjut dari nomor terakhir hari itu', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue({ number: 'TRF-20261123-0007' });
      await service.create(dto, user);
      const data = prisma.stockTransfer.create.mock.calls[0][0].data;
      expect(data.number).toBe('TRF-20261123-0008');
      expect(data.status).toBeUndefined(); // default DRAFT dari DB
      expect(inventory.issue).not.toHaveBeenCalled(); // draft belum menyentuh stok
    });

    it('tolak gudang asal = tujuan', async () => {
      await expect(service.create({ ...dto, toWarehouseId: 'whA' }, user)).rejects.toThrow(
        'tidak boleh sama',
      );
    });

    it('tolak produk dobel', async () => {
      await expect(
        service.create({ ...dto, items: [dto.items[0], dto.items[0]] }, user),
      ).rejects.toThrow('dua kali');
    });

    it('tolak gudang nonaktif', async () => {
      prisma.warehouse.count.mockResolvedValue(1);
      await expect(service.create(dto, user)).rejects.toThrow('nonaktif');
    });
  });

  describe('send', () => {
    it('DRAFT → SENT: issue tiap item dari gudang asal dengan referensi transfer', async () => {
      withStatus(StockTransferStatus.DRAFT);
      await service.send('trf1', user);
      expect(inventory.issue).toHaveBeenCalledTimes(2);
      expect(inventory.issue).toHaveBeenCalledWith(prisma, {
        productId: 'p1',
        warehouseId: 'whA',
        quantity: 5,
        referenceType: StockReferenceType.STOCK_TRANSFER,
        referenceId: 'trf1',
        note: expect.stringContaining('TRF-20261123-0001'),
        createdById: user.id,
      });
      expect(prisma.stockTransfer.updateMany.mock.calls[0][0].data.status).toBe(
        StockTransferStatus.SENT,
      );
    });

    it('stok kurang ⇒ error InsufficientStock dan transaksi gagal', async () => {
      withStatus(StockTransferStatus.DRAFT);
      inventory.issue
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new InsufficientStockException('p2', 'whA', 3, 1));
      await expect(service.send('trf1', user)).rejects.toBeInstanceOf(InsufficientStockException);
      // error dilempar dari dalam callback $transaction ⇒ Prisma rollback semua (status + item 1)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('tidak bisa send dua kali', async () => {
      withStatus(StockTransferStatus.SENT);
      await expect(service.send('trf1', user)).rejects.toThrow('aksi hanya untuk status DRAFT');
      expect(inventory.issue).not.toHaveBeenCalled();
    });

    it('404 kalau transfer tidak ada', async () => {
      prisma.stockTransfer.findUnique.mockResolvedValue(null);
      await expect(service.send('x', user)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('receive', () => {
    it('SENT → RECEIVED: default terima penuh ke gudang tujuan', async () => {
      withStatus(StockTransferStatus.SENT);
      await service.receive('trf1', {}, user);
      expect(inventory.receive).toHaveBeenCalledTimes(2);
      expect(inventory.receive.mock.calls[0][1]).toMatchObject({
        productId: 'p1',
        warehouseId: 'whB',
        quantity: 5,
        referenceType: StockReferenceType.STOCK_TRANSFER,
      });
      expect(prisma.stockTransferItem.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { receivedQuantity: 5 },
      });
    });

    it('terima sebagian: yang masuk = receivedQuantity, qty 0 tanpa movement', async () => {
      withStatus(StockTransferStatus.SENT);
      await service.receive(
        'trf1',
        {
          items: [
            { productId: 'p1', receivedQuantity: 4 },
            { productId: 'p2', receivedQuantity: 0 },
          ],
        },
        user,
      );
      expect(inventory.receive).toHaveBeenCalledTimes(1);
      expect(inventory.receive.mock.calls[0][1]).toMatchObject({ productId: 'p1', quantity: 4 });
      expect(inventory.receive.mock.calls[0][1].note).toContain('kurang 1');
    });

    it('tolak qty diterima > qty dikirim', async () => {
      withStatus(StockTransferStatus.SENT);
      await expect(
        service.receive('trf1', { items: [{ productId: 'p1', receivedQuantity: 6 }] }, user),
      ).rejects.toThrow('melebihi');
    });

    it('tolak produk yang tidak ada di transfer', async () => {
      withStatus(StockTransferStatus.SENT);
      await expect(
        service.receive('trf1', { items: [{ productId: 'pX', receivedQuantity: 1 }] }, user),
      ).rejects.toThrow('tidak termasuk');
    });

    it('DRAFT belum bisa diterima', async () => {
      withStatus(StockTransferStatus.DRAFT);
      await expect(service.receive('trf1', {}, user)).rejects.toBeInstanceOf(BadRequestException);
      expect(inventory.receive).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('dari DRAFT: tanpa efek stok', async () => {
      withStatus(StockTransferStatus.DRAFT);
      await service.cancel('trf1', user);
      expect(prisma.stockTransfer.updateMany.mock.calls[0][0].data.status).toBe(
        StockTransferStatus.CANCELLED,
      );
      expect(inventory.receive).not.toHaveBeenCalled();
    });

    it('dari SENT: stok dikembalikan ke gudang ASAL', async () => {
      withStatus(StockTransferStatus.SENT);
      await service.cancel('trf1', user);
      expect(inventory.receive).toHaveBeenCalledTimes(2);
      expect(inventory.receive.mock.calls[0][1]).toMatchObject({
        productId: 'p1',
        warehouseId: 'whA',
        quantity: 5,
        referenceType: StockReferenceType.STOCK_TRANSFER,
        referenceId: 'trf1',
      });
    });

    it('RECEIVED tidak bisa dibatalkan', async () => {
      withStatus(StockTransferStatus.RECEIVED);
      await expect(service.cancel('trf1', user)).rejects.toThrow('DRAFT/SENT');
      expect(prisma.stockTransfer.updateMany).not.toHaveBeenCalled();
    });
  });

  it('update/hapus hanya untuk DRAFT', async () => {
    withStatus(StockTransferStatus.SENT);
    await expect(service.remove('trf1')).rejects.toThrow('DRAFT');
    await expect(service.update('trf1', { notes: 'x' })).rejects.toThrow('DRAFT');
    expect(prisma.stockTransfer.delete).not.toHaveBeenCalled();
  });
});
