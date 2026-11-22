import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { Role, SalesOrderStatus, StockReferenceType } from '../generated/prisma/enums.js';
import { InsufficientStockException, type InventoryService } from '../inventory/index.js';
import { CurrenciesService } from '../currencies/index.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SalesOrdersService } from './sales-orders.service.js';

/**
 * Unit test murni: Prisma & InventoryService di-mock (mirip Mockito di Java).
 * `$transaction(fn)` langsung menjalankan callback dengan mock yang sama sebagai `tx`.
 */
describe('SalesOrdersService', () => {
  const user = { id: 'u-sales', email: 'sales@erp.local', role: Role.SALES };
  const baseSo = {
    id: 'so1',
    number: 'SO-20261122-0001',
    warehouseId: 'wh1',
    customerId: 'cus1',
    status: SalesOrderStatus.DRAFT,
    currencyCode: 'IDR',
    exchangeRate: new Prisma.Decimal(1),
    totalAmount: new Prisma.Decimal(1000),
    orderDate: new Date('2026-11-22T03:00:00Z'),
  };
  const soWithItems = {
    ...baseSo,
    items: [
      { productId: 'p1', quantity: 5, product: { sku: 'KOPI-01' } },
      { productId: 'p2', quantity: 2, product: { sku: 'TEH-01' } },
    ],
  };

  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    product: { count: ReturnType<typeof vi.fn> };
    customer: { findUnique: ReturnType<typeof vi.fn> };
    currency: { findUnique: ReturnType<typeof vi.fn> };
    exchangeRate: { findFirst: ReturnType<typeof vi.fn> };
    salesOrder: Record<
      'findMany' | 'count' | 'findUnique' | 'findFirst' | 'create' | 'update' | 'updateMany' | 'delete',
      ReturnType<typeof vi.fn>
    >;
    salesOrderItem: Record<'findMany' | 'deleteMany', ReturnType<typeof vi.fn>>;
  };
  let inventory: { issue: ReturnType<typeof vi.fn>; getQuantity: ReturnType<typeof vi.fn> };
  let service: SalesOrdersService;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn((arg: unknown) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]),
      ),
      product: { count: vi.fn() },
      customer: { findUnique: vi.fn().mockResolvedValue({ currencyCode: null }) },
      currency: { findUnique: vi.fn().mockResolvedValue({ isActive: true }) },
      exchangeRate: { findFirst: vi.fn().mockResolvedValue({ rate: new Prisma.Decimal('16000') }) },
      salesOrder: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn((args: { data: unknown }) => Promise.resolve({ id: 'so1', ...(args.data as object) })),
        update: vi.fn().mockResolvedValue(baseSo),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn().mockResolvedValue(baseSo),
      },
      salesOrderItem: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    inventory = {
      issue: vi.fn().mockResolvedValue(undefined),
      getQuantity: vi.fn().mockResolvedValue(100),
    };
    service = new SalesOrdersService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
      // CurrenciesService asli di atas Prisma mock yang sama (bukan di-mock), jadi aturan kurs ikut teruji.
      new CurrenciesService(prisma as unknown as PrismaService),
    );
  });

  describe('multi-currency', () => {
    const dto = {
      customerId: 'cus1',
      warehouseId: 'wh1',
      orderDate: '2026-11-22',
      items: [{ productId: 'p1', quantity: 3, unitPrice: 10.5 }],
    };
    beforeEach(() => prisma.product.count.mockResolvedValue(1));

    it('default IDR, kurs 1, total base = total', async () => {
      await service.create(dto, user);
      const data = prisma.salesOrder.create.mock.calls[0][0].data;
      expect(data.currencyCode).toBe('IDR');
      expect(data.exchangeRate.toString()).toBe('1');
      expect(data.totalAmountBase.toString()).toBe('31.5');
      expect(prisma.exchangeRate.findFirst).not.toHaveBeenCalled();
    });

    it('pakai mata uang default customer + kurs dari tabel per orderDate', async () => {
      prisma.customer.findUnique.mockResolvedValue({ currencyCode: 'USD' });
      await service.create(dto, user);
      const data = prisma.salesOrder.create.mock.calls[0][0].data;
      expect(data.currencyCode).toBe('USD');
      expect(data.exchangeRate.toString()).toBe('16000');
      expect(data.totalAmount.toString()).toBe('31.5');
      expect(data.totalAmountBase.toString()).toBe('504000');
      expect(prisma.exchangeRate.findFirst.mock.calls[0][0].where).toEqual({
        currencyCode: 'USD',
        effectiveDate: { lte: new Date('2026-11-22T00:00:00Z') },
      });
    });

    it('currencyCode + kurs manual dari request menang atas default customer', async () => {
      prisma.customer.findUnique.mockResolvedValue({ currencyCode: 'USD' });
      await service.create({ ...dto, currencyCode: 'SGD', exchangeRate: 12000.25 }, user);
      const data = prisma.salesOrder.create.mock.calls[0][0].data;
      expect(data.currencyCode).toBe('SGD');
      expect(data.totalAmountBase.toString()).toBe('378007.88');
      expect(prisma.exchangeRate.findFirst).not.toHaveBeenCalled();
    });

    it('400 kalau belum ada kurs untuk tanggal itu', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(null);
      await expect(service.create({ ...dto, currencyCode: 'USD' }, user)).rejects.toThrow(
        'Belum ada kurs USD',
      );
      expect(prisma.salesOrder.create).not.toHaveBeenCalled();
    });

    it('400 kalau mata uang nonaktif', async () => {
      prisma.currency.findUnique.mockResolvedValue({ isActive: false });
      await expect(service.create({ ...dto, currencyCode: 'USD' }, user)).rejects.toThrow('nonaktif');
    });

    it('update DRAFT tanpa ganti mata uang/tanggal: kurs lama dipertahankan, total base dihitung ulang', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue({
        ...baseSo,
        currencyCode: 'USD',
        exchangeRate: new Prisma.Decimal('15000'),
      });
      await service.update('so1', { items: [{ productId: 'p1', quantity: 2, unitPrice: 5 }] });
      const data = prisma.salesOrder.update.mock.calls[0][0].data;
      expect(data.exchangeRate.toString()).toBe('15000');
      expect(data.totalAmountBase.toString()).toBe('150000');
      expect(prisma.exchangeRate.findFirst).not.toHaveBeenCalled();
    });

    it('update DRAFT ganti mata uang: kurs diambil ulang, total lama dipakai kalau items tidak dikirim', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue(baseSo);
      await service.update('so1', { currencyCode: 'USD' });
      const data = prisma.salesOrder.update.mock.calls[0][0].data;
      expect(data.currencyCode).toBe('USD');
      expect(data.totalAmountBase.toString()).toBe('16000000');
    });

    it('confirmed tidak mengubah kurs (sudah terkunci di dokumen)', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue({ ...baseSo, items: [] });
      await service.confirm('so1');
      const data = prisma.salesOrder.updateMany.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('exchangeRate');
      expect(data).not.toHaveProperty('totalAmountBase');
    });
  });

  describe('create', () => {
    const dto = {
      customerId: 'cus1',
      warehouseId: 'wh1',
      items: [
        { productId: 'p1', quantity: 3, unitPrice: 0.1 },
        { productId: 'p2', quantity: 3, unitPrice: 0.2 },
      ],
    };

    it('menghitung total pakai Decimal (0.1*3 + 0.2*3 = 0.9 tepat)', async () => {
      prisma.product.count.mockResolvedValue(2);

      await service.create(dto, user);

      const data = prisma.salesOrder.create.mock.calls[0][0].data;
      expect(data.number).toMatch(/^SO-\d{8}-0001$/);
      expect(data.totalAmount.toString()).toBe('0.9');
    });

    it('retry kalau nomor SO bentrok (P2002), maksimal 3 kali', async () => {
      prisma.product.count.mockResolvedValue(2);
      const conflict = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.salesOrder.create.mockRejectedValue(conflict);

      await expect(service.create(dto, user)).rejects.toBe(conflict);
      expect(prisma.salesOrder.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('update & remove', () => {
    it('hanya boleh saat DRAFT', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue({
        ...baseSo,
        status: SalesOrderStatus.CONFIRMED,
      });
      await expect(service.remove('so1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.salesOrder.delete).not.toHaveBeenCalled();
    });

    it('404 kalau SO tidak ada', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', { notes: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('confirm', () => {
    it('DRAFT → CONFIRMED kalau stok cukup', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue(soWithItems);

      await service.confirm('so1');

      expect(inventory.getQuantity).toHaveBeenCalledWith('p1', 'wh1');
      const args = prisma.salesOrder.updateMany.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'so1', status: { in: [SalesOrderStatus.DRAFT] } });
      expect(args.data.status).toBe(SalesOrderStatus.CONFIRMED);
    });

    it('ditolak dengan daftar semua produk yang stoknya kurang', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue(soWithItems);
      inventory.getQuantity.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await expect(service.confirm('so1')).rejects.toThrow(
        'Stok tidak cukup: KOPI-01 (diminta 5, tersedia 1); TEH-01 (diminta 2, tersedia 0)',
      );
      expect(prisma.salesOrder.updateMany).not.toHaveBeenCalled();
    });

    it('ditolak kalau status bukan DRAFT', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue({
        ...soWithItems,
        status: SalesOrderStatus.SHIPPED,
      });
      prisma.salesOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.confirm('so1')).rejects.toThrow('berstatus SHIPPED');
    });
  });

  describe('ship', () => {
    const warehouseUser = { ...user, id: 'u-wh', role: Role.WAREHOUSE };

    it('CONFIRMED → SHIPPED dan stok tiap item keluar lewat InventoryService.issue', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue({
        ...baseSo,
        status: SalesOrderStatus.SHIPPED,
      });
      prisma.salesOrderItem.findMany.mockResolvedValue(soWithItems.items);

      await service.ship('so1', warehouseUser);

      expect(prisma.salesOrder.updateMany.mock.calls[0][0].where.status).toEqual({
        in: [SalesOrderStatus.CONFIRMED],
      });
      expect(inventory.issue).toHaveBeenCalledTimes(2);
      expect(inventory.issue).toHaveBeenCalledWith(prisma, {
        productId: 'p1',
        warehouseId: 'wh1',
        quantity: 5,
        referenceType: StockReferenceType.SALES_ORDER,
        referenceId: 'so1',
        note: 'Pengiriman SO-20261122-0001',
        createdById: 'u-wh',
      });
    });

    it('stok kurang saat ship → error diteruskan (transaksi rollback)', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue({
        ...baseSo,
        status: SalesOrderStatus.SHIPPED,
      });
      prisma.salesOrderItem.findMany.mockResolvedValue(soWithItems.items);
      inventory.issue
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new InsufficientStockException('p2', 'wh1', 2, 0));

      await expect(service.ship('so1', warehouseUser)).rejects.toBeInstanceOf(
        InsufficientStockException,
      );
    });

    it('ditolak kalau belum CONFIRMED, stok tidak disentuh', async () => {
      prisma.salesOrder.updateMany.mockResolvedValue({ count: 0 });
      prisma.salesOrder.findUnique.mockResolvedValue(baseSo);

      await expect(service.ship('so1', warehouseUser)).rejects.toBeInstanceOf(BadRequestException);
      expect(inventory.issue).not.toHaveBeenCalled();
    });
  });

  it('cancel boleh dari DRAFT atau CONFIRMED', async () => {
    prisma.salesOrder.findUnique.mockResolvedValue(baseSo);
    await service.cancel('so1');
    expect(prisma.salesOrder.updateMany.mock.calls[0][0].where.status).toEqual({
      in: [SalesOrderStatus.DRAFT, SalesOrderStatus.CONFIRMED],
    });
  });
});
