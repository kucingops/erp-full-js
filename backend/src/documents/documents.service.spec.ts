import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client.js';
import {
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  PurchaseOrderStatus,
  Role,
  SalesOrderStatus,
} from '../generated/prisma/enums.js';
import { ROLES_KEY } from '../common/decorators/roles.decorator.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DocumentsController, toPdf } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { PdfRenderer } from './pdf-renderer.js';

/**
 * Unit test service: Prisma & renderer di-mock (mirip Mockito). Satu test pakai
 * renderer asli untuk memastikan output benar-benar file PDF.
 */
describe('DocumentsService', () => {
  const D = (v: string | number) => new Prisma.Decimal(v);
  const now = new Date('2026-11-22T03:00:00Z');
  const product = { sku: 'P-1', name: 'Kertas A4', unit: 'rim' };
  const item = { quantity: 2, unitPrice: D('50'), subtotal: D('100'), product };
  const partner = {
    code: 'C-1',
    name: 'PT Pelanggan',
    address: 'Jakarta',
    phone: null,
    email: null,
  };

  const invoice = (over: Record<string, unknown> = {}) => ({
    id: 'inv1',
    number: 'INV-20261122-0001',
    type: InvoiceType.SALES,
    status: InvoiceStatus.PARTIAL,
    issueDate: new Date('2026-10-01'),
    dueDate: new Date('2026-10-31'),
    totalAmount: D('100'),
    paidAmount: D('40'),
    currencyCode: 'USD',
    exchangeRate: D('16000'),
    totalAmountBase: D('1600000'),
    notes: null,
    customer: partner,
    supplier: null,
    salesOrder: { number: 'SO-20261001-0001', items: [item] },
    purchaseOrder: null,
    payments: [
      {
        paidAt: new Date('2026-10-10'),
        method: PaymentMethod.TRANSFER,
        reference: 'TRX-1',
        amount: D('40'),
      },
    ],
    createdBy: { name: 'Sari' },
    ...over,
  });

  const order = (over: Record<string, unknown> = {}) => ({
    id: 'o1',
    number: 'PO-20261122-0001',
    status: PurchaseOrderStatus.DRAFT,
    orderDate: now,
    approvedAt: null,
    confirmedAt: null,
    totalAmount: D('100'),
    totalAmountBase: D('100'),
    currencyCode: 'IDR',
    exchangeRate: D(1),
    notes: 'Segera',
    supplier: { ...partner, code: 'S-1', name: 'CV Sumber' },
    customer: partner,
    warehouse: { code: 'WH-1', name: 'Gudang Utama' },
    items: [item],
    createdBy: { name: 'Budi' },
    approvedBy: null,
    ...over,
  });

  type M = ReturnType<typeof vi.fn>;
  let prisma: {
    invoice: { findFirst: M };
    purchaseOrder: { findUnique: M };
    salesOrder: { findUnique: M };
  };
  let renderer: { render: M };
  let config: { get: M };
  let service: DocumentsService;

  beforeEach(() => {
    prisma = {
      invoice: { findFirst: vi.fn() },
      purchaseOrder: { findUnique: vi.fn() },
      salesOrder: { findUnique: vi.fn() },
    };
    renderer = { render: vi.fn().mockResolvedValue(Buffer.from('%PDF-fake')) };
    config = { get: vi.fn((k: string) => ({ COMPANY_NAME: 'PT Uji' })[k]) };
    service = new DocumentsService(
      prisma as unknown as PrismaService,
      renderer as unknown as PdfRenderer,
      config as unknown as ConfigService,
    );
  });

  it('invoice AR: filter by type, petakan pembayaran & sisa (+ IDR), status overdue', async () => {
    prisma.invoice.findFirst.mockResolvedValue(invoice());
    const doc = await service.load('SALES_INVOICE', 'inv1', now);

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv1', type: InvoiceType.SALES },
      }),
    );
    expect(doc).toMatchObject({
      kind: 'SALES_INVOICE',
      title: 'INVOICE',
      statusLabel: 'Dibayar sebagian, lewat jatuh tempo',
      party: { heading: 'Ditagihkan kepada', name: 'PT Pelanggan' },
      currencyCode: 'USD',
      subtotal: '100',
      taxAmount: '0',
      totalBase: '1600000',
      payment: {
        isOverdue: true,
        paidAmount: '40',
        outstandingAmount: '60',
        outstandingAmountBase: '960000',
        payments: [{ method: 'Transfer', reference: 'TRX-1', amount: '40' }],
      },
    });
    expect(doc.meta).toContainEqual({
      label: 'No. SO',
      value: 'SO-20261001-0001',
    });
    expect(doc.items[0]).toMatchObject({
      sku: 'P-1',
      quantity: 2,
      unitPrice: '50',
    });
  });

  it('tagihan AP: partner supplier & no. PO; lunas → watermark LUNAS', async () => {
    prisma.invoice.findFirst.mockResolvedValue(
      invoice({
        type: InvoiceType.PURCHASE,
        status: InvoiceStatus.PAID,
        paidAmount: D('100'),
        customer: null,
        supplier: { ...partner, name: 'CV Sumber' },
        salesOrder: null,
        purchaseOrder: { number: 'PO-1', items: [item] },
      }),
    );
    const doc = await service.load('PURCHASE_BILL', 'inv1', now);
    expect(prisma.invoice.findFirst.mock.calls[0][0].where.type).toBe(
      InvoiceType.PURCHASE,
    );
    expect(doc).toMatchObject({
      title: 'TAGIHAN PEMBELIAN',
      statusLabel: 'Lunas',
      watermark: 'LUNAS',
      party: { heading: 'Supplier', name: 'CV Sumber' },
      payment: { outstandingAmount: '0', isOverdue: false },
    });
    expect(doc.meta).toContainEqual({ label: 'No. PO', value: 'PO-1' });
  });

  it('PO draft: watermark DRAFT, gudang & penanda tangan', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue(order());
    const doc = await service.load('PURCHASE_ORDER', 'o1');
    expect(doc).toMatchObject({
      title: 'PURCHASE ORDER',
      statusLabel: 'Draft',
      watermark: 'DRAFT',
      party: { name: 'CV Sumber' },
      notes: 'Segera',
    });
    expect(doc.payment).toBeUndefined();
    expect(doc.meta).toContainEqual({
      label: 'Gudang tujuan',
      value: 'WH-1 - Gudang Utama',
    });
    expect(doc.signatures[0]).toEqual({ label: 'Dibuat oleh', name: 'Budi' });
  });

  it('SO batal: watermark DIBATALKAN', async () => {
    prisma.salesOrder.findUnique.mockResolvedValue(
      order({ number: 'SO-1', status: SalesOrderStatus.CANCELLED }),
    );
    const doc = await service.load('SALES_ORDER', 'o1');
    expect(doc).toMatchObject({
      title: 'SALES ORDER',
      statusLabel: 'Dibatalkan',
      watermark: 'DIBATALKAN',
      party: { heading: 'Pelanggan' },
    });
  });

  it.each([
    'SALES_INVOICE',
    'PURCHASE_BILL',
    'PURCHASE_ORDER',
    'SALES_ORDER',
  ] as const)('%s tidak ditemukan → 404', async (kind) => {
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.purchaseOrder.findUnique.mockResolvedValue(null);
    prisma.salesOrder.findUnique.mockResolvedValue(null);
    await expect(service.load(kind, 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('render: kop dari config, nama file = nomor dokumen', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue(order());
    const out = await service.render('PURCHASE_ORDER', 'o1', now);
    expect(out.filename).toBe('PO-20261122-0001.pdf');
    const def = renderer.render.mock.calls[0][0];
    expect(JSON.stringify(def.content)).toContain('PT Uji');
    expect(def.info.author).toBe('PT Uji');
  });

  it('renderer asli menghasilkan file PDF', async () => {
    service = new DocumentsService(
      prisma as unknown as PrismaService,
      new PdfRenderer(),
      config as unknown as ConfigService,
    );
    prisma.invoice.findFirst.mockResolvedValue(invoice());
    const { buffer } = await service.render('SALES_INVOICE', 'inv1', now);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});

describe('DocumentsController', () => {
  const roles = (m: keyof DocumentsController) =>
    Reflect.getMetadata(ROLES_KEY, DocumentsController.prototype[m]) as Role[];

  it('role = role baca tiap dokumen (matriks CONTRIBUTING)', () => {
    expect(roles('salesInvoice')).toEqual([Role.SALES]);
    expect(roles('purchaseBill')).toEqual([Role.PURCHASING]);
    expect(roles('purchaseOrder')).toEqual([Role.PURCHASING, Role.WAREHOUSE]);
    expect(roles('salesOrder')).toEqual([Role.SALES, Role.WAREHOUSE]);
  });

  it('toPdf: inline default, attachment kalau download', () => {
    const pdf = { buffer: Buffer.from('%PDF-'), filename: 'INV-1.pdf' };
    expect(toPdf(pdf).getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: 'inline; filename="INV-1.pdf"',
      length: 5,
    });
    expect(toPdf(pdf, true).getHeaders().disposition).toBe(
      'attachment; filename="INV-1.pdf"',
    );
  });
});
