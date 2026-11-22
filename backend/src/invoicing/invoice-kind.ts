import { Prisma } from '../generated/prisma/client.js';
import {
  InvoiceType,
  PurchaseOrderStatus,
  SalesOrderStatus,
} from '../generated/prisma/enums.js';
type TxClient = Prisma.TransactionClient;

/** Order yang mau ditagih, dalam bentuk netral (SO atau PO). */
export interface BillableOrder {
  id: string;
  number: string;
  partnerId: string;
  totalAmount: Prisma.Decimal;
  /** Mata uang & kurs order: diwarisi invoice (lihat docs/multi-currency.md) */
  currencyCode: string;
  exchangeRate: Prisma.Decimal;
  /** sudah SHIPPED (SO) / RECEIVED (PO)? */
  ready: boolean;
  status: string;
}

/**
 * Strategy pattern: perbedaan invoice penjualan (AR) vs tagihan pembelian (AP)
 * dikumpulkan di sini, jadi `InvoicesService` cukup satu dan tidak penuh `if (type)`.
 * Kalau di Java: `interface InvoiceKind` + dua implementasi `@Component`.
 */
export interface InvoiceKind {
  type: InvoiceType;
  /** prefix nomor dokumen: INV-YYYYMMDD-XXXX / BILL-YYYYMMDD-XXXX */
  prefix: string;
  label: string;
  orderLabel: string;
  readyStatus: string;
  orderField: 'salesOrderId' | 'purchaseOrderId';
  partnerField: 'customerId' | 'supplierId';
  findOrder(tx: TxClient, orderId: string): Promise<BillableOrder | null>;
  /** Order yang siap ditagih tapi belum punya invoice (untuk dropdown FE). */
  listCandidates(tx: TxClient, search?: string): Promise<unknown[]>;
}

const partnerSelect = { select: { id: true, code: true, name: true } } as const;

export const SALES_KIND: InvoiceKind = {
  type: InvoiceType.SALES,
  prefix: 'INV',
  label: 'Invoice',
  orderLabel: 'Sales order',
  readyStatus: SalesOrderStatus.SHIPPED,
  orderField: 'salesOrderId',
  partnerField: 'customerId',
  async findOrder(tx, orderId) {
    const so = await tx.salesOrder.findUnique({ where: { id: orderId } });
    if (!so) return null;
    return {
      id: so.id,
      number: so.number,
      partnerId: so.customerId,
      totalAmount: so.totalAmount,
      currencyCode: so.currencyCode,
      exchangeRate: so.exchangeRate,
      ready: so.status === SalesOrderStatus.SHIPPED,
      status: so.status,
    };
  },
  listCandidates(tx, search) {
    return tx.salesOrder.findMany({
      where: {
        status: SalesOrderStatus.SHIPPED,
        invoice: { is: null },
        ...(search ? { number: { contains: search, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        number: true,
        orderDate: true,
        totalAmount: true,
        currencyCode: true,
        exchangeRate: true,
        totalAmountBase: true,
        customer: partnerSelect,
      },
      orderBy: { shippedAt: 'desc' },
      take: 50,
    });
  },
};

export const PURCHASE_KIND: InvoiceKind = {
  type: InvoiceType.PURCHASE,
  prefix: 'BILL',
  label: 'Tagihan',
  orderLabel: 'Purchase order',
  readyStatus: PurchaseOrderStatus.RECEIVED,
  orderField: 'purchaseOrderId',
  partnerField: 'supplierId',
  async findOrder(tx, orderId) {
    const po = await tx.purchaseOrder.findUnique({ where: { id: orderId } });
    if (!po) return null;
    return {
      id: po.id,
      number: po.number,
      partnerId: po.supplierId,
      totalAmount: po.totalAmount,
      currencyCode: po.currencyCode,
      exchangeRate: po.exchangeRate,
      ready: po.status === PurchaseOrderStatus.RECEIVED,
      status: po.status,
    };
  },
  listCandidates(tx, search) {
    return tx.purchaseOrder.findMany({
      where: {
        status: PurchaseOrderStatus.RECEIVED,
        invoice: { is: null },
        ...(search ? { number: { contains: search, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        number: true,
        orderDate: true,
        totalAmount: true,
        currencyCode: true,
        exchangeRate: true,
        totalAmountBase: true,
        supplier: partnerSelect,
      },
      orderBy: { receivedAt: 'desc' },
      take: 50,
    });
  },
};

export const INVOICE_KINDS: Record<InvoiceType, InvoiceKind> = {
  [InvoiceType.SALES]: SALES_KIND,
  [InvoiceType.PURCHASE]: PURCHASE_KIND,
};
