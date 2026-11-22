import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PurchaseOrderStatus, Role } from '../generated/prisma/enums.js';
import type { InventoryService } from '../inventory/index.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';

/**
 * Unit test murni: Prisma & InventoryService di-mock (mirip Mockito di Java).
 * `$transaction(fn)` langsung menjalankan callback dengan mock yang sama sebagai `tx`.
 */
describe('PurchaseOrdersService', () => {
  const user = { id: 'u-purch', email: 'purch@erp.local', role: Role.PURCHASING };
  const basePo = {
    id: 'po1',
    number: 'PO-20261122-0001',
    warehouseId: 'wh1',
    supplierId: 'sup1',
    status: PurchaseOrderStatus.DRAFT,
  };

  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    product: { count: ReturnType<typeof vi.fn> };
    purchaseOrder: Record<
      'findMany' | 'count' | 'findUnique' | 'findFirst' | 'create' | 'update' | 'updateMany' | 'delete',
      ReturnType<typeof vi.fn>
    >;
    purchaseOrderItem: Record<'findMany' | 'deleteMany', ReturnType<typeof vi.fn>>;
  };
  let inventory: { receive: ReturnType<typeof vi.fn> };
  let service: PurchaseOrdersService;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn((arg: unknown) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]),
      ),
      product: { count: vi.fn() },
      purchaseOrder: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn((args: { data: unknown }) => Promise.resolve({ id: 'po1', ...(args.data as object) })),
        update: vi.fn().mockResolvedValue(basePo),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn().mockResolvedValue(basePo),
      },
      purchaseOrderItem: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    inventory = { receive: vi.fn().mockResolvedValue(undefined) };
    service = new PurchaseOrdersService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
    );
  });

  describe('create', () => {
    const dto = {
      supplierId: 'sup1',
      warehouseId: 'wh1',
      items: [
        { productId: 'p1', quantity: 3, unitPrice: 10000.5 },
        { productId: 'p2', quantity: 2, unitPrice: 2500 },
      ],
    };

    it('menghitung subtotal & total pakai Decimal dan memberi nomor PO', async () => {
      prisma.product.count.mockResolvedValue(2);
      prisma.purchaseOrder.findFirst.mockResolvedValue({ number: 'PO-20261122-0004' });

      await service.create(dto, user);

      const data = prisma.purchaseOrder.create.mock.calls[0][0].data;
      expect(data.number).toMatch(/^PO-\d{8}-\d{4}$/);
      expect(data.createdById).toBe('u-purch');
      expect(data.items.create[0].subtotal.toString()).toBe('30001.5');
      expect(data.totalAmount.toString()).toBe('35001.5');
    });

    it('menolak produk yang tidak ada / nonaktif', async () => {
      prisma.product.count.mockResolvedValue(1);
      await expect(service.create(dto, user)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
    });

    it('menolak produk duplikat dalam satu PO', async () => {
      const dup = { ...dto, items: [dto.items[0], dto.items[0]] };
      await expect(service.create(dup, user)).rejects.toThrow('dua kali');
    });

    it('retry kalau nomor PO bentrok (P2002)', async () => {
      prisma.product.count.mockResolvedValue(2);
      const conflict = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.purchaseOrder.create.mockRejectedValueOnce(conflict);

      await service.create(dto, user);

      expect(prisma.purchaseOrder.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('update & remove', () => {
    it('hanya boleh saat DRAFT', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        ...basePo,
        status: PurchaseOrderStatus.APPROVED,
      });
      await expect(service.update('po1', { notes: 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.remove('po1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('mengganti semua item kalau items dikirim', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(basePo);
      prisma.product.count.mockResolvedValue(1);

      await service.update('po1', { items: [{ productId: 'p1', quantity: 4, unitPrice: 100 }] });

      expect(prisma.purchaseOrderItem.deleteMany).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po1' },
      });
      expect(prisma.purchaseOrder.update.mock.calls[0][0].data.totalAmount.toString()).toBe('400');
    });

    it('404 kalau PO tidak ada', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(null);
      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('state machine', () => {
    it('approve: DRAFT → APPROVED dan mencatat approver', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(basePo);

      await service.approve('po1', user);

      const args = prisma.purchaseOrder.updateMany.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'po1', status: { in: [PurchaseOrderStatus.DRAFT] } });
      expect(args.data).toMatchObject({
        status: PurchaseOrderStatus.APPROVED,
        approvedById: 'u-purch',
      });
    });

    it('approve ditolak kalau status bukan DRAFT', async () => {
      prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        ...basePo,
        status: PurchaseOrderStatus.RECEIVED,
      });
      await expect(service.approve('po1', user)).rejects.toThrow('berstatus RECEIVED');
    });

    it('receive: APPROVED → RECEIVED dan stok tiap item masuk lewat InventoryService', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        ...basePo,
        status: PurchaseOrderStatus.RECEIVED,
      });
      prisma.purchaseOrderItem.findMany.mockResolvedValue([
        { productId: 'p1', quantity: 3 },
        { productId: 'p2', quantity: 2 },
      ]);
      const warehouseUser = { ...user, id: 'u-wh', role: Role.WAREHOUSE };

      await service.receive('po1', warehouseUser);

      expect(prisma.purchaseOrder.updateMany.mock.calls[0][0].where.status).toEqual({
        in: [PurchaseOrderStatus.APPROVED],
      });
      expect(inventory.receive).toHaveBeenCalledTimes(2);
      expect(inventory.receive).toHaveBeenCalledWith(prisma, {
        productId: 'p1',
        warehouseId: 'wh1',
        quantity: 3,
        referenceType: 'PURCHASE_ORDER',
        referenceId: 'po1',
        note: 'Penerimaan PO-20261122-0001',
        createdById: 'u-wh',
      });
    });

    it('receive ditolak kalau belum di-approve, stok tidak berubah', async () => {
      prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 0 });
      prisma.purchaseOrder.findUnique.mockResolvedValue(basePo);

      await expect(service.receive('po1', user)).rejects.toBeInstanceOf(BadRequestException);
      expect(inventory.receive).not.toHaveBeenCalled();
    });

    it('cancel boleh dari DRAFT atau APPROVED', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(basePo);
      await service.cancel('po1');
      expect(prisma.purchaseOrder.updateMany.mock.calls[0][0].where.status).toEqual({
        in: [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.APPROVED],
      });
    });
  });

  it('findAll memakai filter status + search dan format { data, meta }', async () => {
    const res = await service.findAll({
      page: 1,
      limit: 10,
      sortOrder: 'desc',
      status: PurchaseOrderStatus.DRAFT,
      search: 'PO-2026',
    });
    const where = prisma.purchaseOrder.findMany.mock.calls[0][0].where;
    expect(where.status).toBe(PurchaseOrderStatus.DRAFT);
    expect(where.OR).toHaveLength(2);
    expect(res.meta).toEqual({ page: 1, limit: 10, total: 0, totalPages: 1 });
  });
});
