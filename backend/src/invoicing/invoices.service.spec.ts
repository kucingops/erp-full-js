import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  InvoiceStatus,
  InvoiceType,
  PurchaseOrderStatus,
  Role,
  SalesOrderStatus,
} from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { InvoicesService } from './invoices.service.js';

/**
 * Unit test murni: Prisma di-mock (mirip Mockito di Java).
 * `$transaction(fn)` menjalankan callback dengan mock yang sama sebagai `tx`.
 */
describe('InvoicesService', () => {
  const user = { id: 'u1', email: 'sales@erp.local', role: Role.SALES };
  const D = (v: string | number) => new Prisma.Decimal(v);
  const page = { page: 1, limit: 10, sortOrder: 'desc' as const };

  const invoice = (over: Record<string, unknown> = {}) => ({
    id: 'inv1',
    number: 'INV-20261122-0001',
    type: InvoiceType.SALES,
    status: InvoiceStatus.UNPAID,
    totalAmount: D('1000'),
    paidAmount: D('0'),
    dueDate: new Date('2099-01-01'),
    ...over,
  });

  type M = ReturnType<typeof vi.fn>;
  let prisma: {
    $transaction: M;
    $queryRaw: M;
    invoice: Record<'findMany' | 'count' | 'findFirst' | 'create' | 'update' | 'delete', M>;
    payment: Record<'create' | 'findFirst' | 'delete', M>;
    salesOrder: Record<'findUnique' | 'findMany', M>;
    purchaseOrder: Record<'findUnique' | 'findMany', M>;
  };
  let service: InvoicesService;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn((arg: unknown) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]),
      ),
      $queryRaw: vi.fn().mockResolvedValue([]),
      invoice: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn(),
        create: vi.fn((args: { data: object }) => Promise.resolve(invoice(args.data as Record<string, unknown>))),
        update: vi.fn().mockResolvedValue(invoice()),
        delete: vi.fn().mockResolvedValue(invoice()),
      },
      payment: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn(),
        delete: vi.fn().mockResolvedValue({}),
      },
      salesOrder: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      purchaseOrder: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    };
    service = new InvoicesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    const shippedSo = {
      id: 'so1',
      number: 'SO-20261122-0001',
      customerId: 'cus1',
      totalAmount: D('1500.50'),
      status: SalesOrderStatus.SHIPPED,
    };

    it('invoice SALES dari SO SHIPPED: total & customer dari SO, due = issue + 30 hari', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue(shippedSo);
      prisma.invoice.findFirst.mockResolvedValue(null);

      await service.create(InvoiceType.SALES, { orderId: 'so1', issueDate: '2026-11-22' }, user);

      const data = prisma.invoice.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        type: InvoiceType.SALES,
        salesOrderId: 'so1',
        customerId: 'cus1',
        createdById: 'u1',
      });
      expect(data.number).toBe('INV-20261122-0001');
      expect(data.totalAmount.toString()).toBe('1500.5');
      expect(data.dueDate.toISOString().slice(0, 10)).toBe('2026-12-22');
      expect(data).not.toHaveProperty('purchaseOrderId');
    });

    it('tagihan PURCHASE dari PO RECEIVED pakai prefix BILL & supplierId', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        id: 'po1',
        number: 'PO-1',
        supplierId: 'sup1',
        totalAmount: D('700'),
        status: PurchaseOrderStatus.RECEIVED,
      });
      prisma.invoice.findFirst.mockResolvedValue(null);

      await service.create(InvoiceType.PURCHASE, { orderId: 'po1', termDays: 14 }, user);

      const data = prisma.invoice.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ purchaseOrderId: 'po1', supplierId: 'sup1' });
      expect(data.number).toMatch(/^BILL-\d{8}-0001$/);
      expect(prisma.salesOrder.findUnique).not.toHaveBeenCalled();
    });

    it('tolak SO yang belum SHIPPED', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue({ ...shippedSo, status: SalesOrderStatus.CONFIRMED });
      await expect(service.create(InvoiceType.SALES, { orderId: 'so1' }, user)).rejects.toThrow(
        /baru bisa ditagih setelah SHIPPED/,
      );
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('409 kalau SO sudah punya invoice', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue(shippedSo);
      prisma.invoice.findFirst.mockResolvedValue({ number: 'INV-20261122-0001' });
      await expect(service.create(InvoiceType.SALES, { orderId: 'so1' }, user)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('404 kalau order tidak ada', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue(null);
      await expect(service.create(InvoiceType.SALES, { orderId: 'x' }, user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('tolak jatuh tempo sebelum tanggal invoice', async () => {
      await expect(
        service.create(
          InvoiceType.SALES,
          { orderId: 'so1', issueDate: '2026-11-22', dueDate: '2026-11-01' },
          user,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('retry kalau nomor bentrok (P2002), maksimal 3 kali', async () => {
      prisma.salesOrder.findUnique.mockResolvedValue(shippedSo);
      prisma.invoice.findFirst.mockResolvedValue(null);
      const dup = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 't' });
      prisma.invoice.create.mockRejectedValue(dup);
      await expect(service.create(InvoiceType.SALES, { orderId: 'so1' }, user)).rejects.toBe(dup);
      expect(prisma.invoice.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('addPayment', () => {
    beforeEach(() => {
      // findFirst dipakai lockInvoice lalu findOne (detail)
      prisma.invoice.findFirst.mockResolvedValue(
        invoice({ paidAmount: D('400'), status: InvoiceStatus.PARTIAL }),
      );
    });

    it('mengunci baris invoice dulu (SELECT ... FOR UPDATE)', async () => {
      await service.addPayment(InvoiceType.SALES, 'inv1', { amount: 100 }, user);
      const sql = (prisma.$queryRaw.mock.calls[0][0] as string[]).join('?');
      expect(sql).toMatch(/FOR UPDATE/);
    });

    it('bayar sebagian -> PARTIAL, paidAmount bertambah', async () => {
      await service.addPayment(InvoiceType.SALES, 'inv1', { amount: 100 }, user);
      expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
        invoiceId: 'inv1',
        method: 'TRANSFER',
        createdById: 'u1',
      });
      const data = prisma.invoice.update.mock.calls[0][0].data;
      expect(data.paidAmount.toString()).toBe('500');
      expect(data.status).toBe(InvoiceStatus.PARTIAL);
    });

    it('bayar pas sisa -> PAID', async () => {
      await service.addPayment(InvoiceType.SALES, 'inv1', { amount: 600 }, user);
      expect(prisma.invoice.update.mock.calls[0][0].data.status).toBe(InvoiceStatus.PAID);
    });

    it('tolak kalau melebihi sisa tagihan', async () => {
      await expect(
        service.addPayment(InvoiceType.SALES, 'inv1', { amount: 600.01 }, user),
      ).rejects.toThrow(/melebihi sisa tagihan 600.00/);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('tolak kalau sudah lunas', async () => {
      prisma.invoice.findFirst.mockResolvedValue(
        invoice({ paidAmount: D('1000'), status: InvoiceStatus.PAID }),
      );
      await expect(service.addPayment(InvoiceType.SALES, 'inv1', { amount: 1 }, user)).rejects.toThrow(
        /sudah lunas/,
      );
    });

    it('404 kalau id milik tipe lain (bill dibuka lewat endpoint invoice)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(
        service.addPayment(InvoiceType.SALES, 'bill1', { amount: 1 }, user),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.findFirst.mock.calls[0][0].where).toEqual({
        id: 'bill1',
        type: InvoiceType.SALES,
      });
    });
  });

  describe('removePayment', () => {
    it('kurangi paidAmount & hitung ulang status (balik ke UNPAID)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(
        invoice({ paidAmount: D('250'), status: InvoiceStatus.PARTIAL }),
      );
      prisma.payment.findFirst.mockResolvedValue({ id: 'pay1', amount: D('250') });

      await service.removePayment(InvoiceType.SALES, 'inv1', 'pay1');

      expect(prisma.payment.delete).toHaveBeenCalledWith({ where: { id: 'pay1' } });
      const data = prisma.invoice.update.mock.calls[0][0].data;
      expect(data.paidAmount.toString()).toBe('0');
      expect(data.status).toBe(InvoiceStatus.UNPAID);
    });

    it('404 kalau payment bukan milik invoice ini', async () => {
      prisma.invoice.findFirst.mockResolvedValue(invoice());
      prisma.payment.findFirst.mockResolvedValue(null);
      await expect(
        service.removePayment(InvoiceType.SALES, 'inv1', 'payX'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('tolak hapus kalau sudah ada pembayaran', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...invoice(), _count: { payments: 1 } });
      await expect(service.remove(InvoiceType.SALES, 'inv1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });

    it('hapus kalau belum ada pembayaran', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...invoice(), _count: { payments: 0 } });
      await service.remove(InvoiceType.SALES, 'inv1');
      expect(prisma.invoice.delete).toHaveBeenCalledWith({ where: { id: 'inv1' } });
    });
  });

  describe('findAll', () => {
    it('filter overdue = belum lunas & dueDate < hari ini, selalu dibatasi type', async () => {
      await service.findAll(InvoiceType.PURCHASE, { ...page, overdue: true });
      const where = prisma.invoice.findMany.mock.calls[0][0].where;
      expect(where.type).toBe(InvoiceType.PURCHASE);
      expect(where.status).toEqual({ in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] });
      expect(where.dueDate.lt).toBeInstanceOf(Date);
    });

    it('partnerId dipetakan ke supplierId untuk tagihan pembelian', async () => {
      await service.findAll(InvoiceType.PURCHASE, { ...page, partnerId: 'sup1' });
      expect(prisma.invoice.findMany.mock.calls[0][0].where.supplierId).toBe('sup1');
    });

    it('menambah outstandingAmount & isOverdue di tiap baris', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        invoice({ paidAmount: D('300'), dueDate: new Date('2000-01-01') }),
      ]);
      prisma.invoice.count.mockResolvedValue(1);
      const res = await service.findAll(InvoiceType.SALES, page);
      expect(res.data[0].outstandingAmount.toString()).toBe('700');
      expect(res.data[0].isOverdue).toBe(true);
      expect(res.meta.total).toBe(1);
    });
  });

  it('summary: total outstanding, overdue, dan top partner', async () => {
    const cus = (id: string) => ({ id, code: id.toUpperCase(), name: `Customer ${id}` });
    prisma.invoice.findMany.mockResolvedValue([
      { ...invoice({ paidAmount: D('200'), dueDate: new Date('2000-01-01') }), customer: cus('a'), supplier: null },
      { ...invoice({ totalAmount: D('500') }), customer: cus('b'), supplier: null },
      { ...invoice({ totalAmount: D('100') }), customer: cus('a'), supplier: null },
    ]);
    const s = await service.summary(InvoiceType.SALES);
    expect(s).toMatchObject({
      openCount: 3,
      totalOutstanding: '1400.00',
      overdueCount: 1,
      overdueAmount: '800.00',
    });
    expect(s.topPartners.map((p) => [p.id, p.outstanding, p.count])).toEqual([
      ['a', '900.00', 2],
      ['b', '500.00', 1],
    ]);
  });
});
