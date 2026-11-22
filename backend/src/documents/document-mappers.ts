import { Prisma } from '../generated/prisma/client.js';
import {
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  PurchaseOrderStatus,
  SalesOrderStatus,
} from '../generated/prisma/enums.js';
import {
  isOverdue,
  outstanding,
  outstandingBase,
} from '../invoicing/invoice-math.js';
import { formatDate } from './format.js';
import type {
  PrintableDocument,
  PrintableItem,
  PrintableParty,
} from './printable-document.js';

/**
 * Mapper entity Prisma → `PrintableDocument`. Bentuk include-nya didefinisikan di sini juga
 * (`*_INCLUDE`) supaya query di service dan tipe input mapper selalu sinkron.
 */

const productSelect = {
  select: { sku: true, name: true, unit: true },
} as const;
const orderItems = { include: { product: productSelect } } as const;
const userName = { select: { name: true } } as const;

export const INVOICE_INCLUDE = {
  customer: true,
  supplier: true,
  salesOrder: { select: { number: true, items: orderItems } },
  purchaseOrder: { select: { number: true, items: orderItems } },
  payments: { orderBy: { paidAt: 'asc' } },
  createdBy: userName,
} satisfies Prisma.InvoiceInclude;

export const PURCHASE_ORDER_INCLUDE = {
  supplier: true,
  warehouse: { select: { code: true, name: true } },
  items: orderItems,
  createdBy: userName,
  approvedBy: userName,
} satisfies Prisma.PurchaseOrderInclude;

export const SALES_ORDER_INCLUDE = {
  customer: true,
  warehouse: { select: { code: true, name: true } },
  items: orderItems,
  createdBy: userName,
} satisfies Prisma.SalesOrderInclude;

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;
type PurchaseOrderRow = Prisma.PurchaseOrderGetPayload<{
  include: typeof PURCHASE_ORDER_INCLUDE;
}>;
type SalesOrderRow = Prisma.SalesOrderGetPayload<{
  include: typeof SALES_ORDER_INCLUDE;
}>;

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  UNPAID: 'Belum dibayar',
  PARTIAL: 'Dibayar sebagian',
  PAID: 'Lunas',
};

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Disetujui',
  RECEIVED: 'Diterima',
  CANCELLED: 'Dibatalkan',
};

export const SO_STATUS_LABEL: Record<SalesOrderStatus, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Dikonfirmasi',
  SHIPPED: 'Dikirim',
  CANCELLED: 'Dibatalkan',
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer',
  OTHER: 'Lainnya',
};

/** Pajak belum dimodelkan di schema (total = jumlah subtotal item), jadi PPN selalu 0. */
const NO_TAX = '0';

const str = (d: Prisma.Decimal) => d.toString();

function mapItems(
  items: {
    quantity: number;
    unitPrice: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    product: { sku: string; name: string; unit: string };
  }[],
): PrintableItem[] {
  return items.map((it) => ({
    sku: it.product.sku,
    name: it.product.name,
    unit: it.product.unit,
    quantity: it.quantity,
    unitPrice: str(it.unitPrice),
    subtotal: str(it.subtotal),
  }));
}

function sumSubtotal(items: { subtotal: Prisma.Decimal }[]) {
  return items.reduce((acc, it) => acc.add(it.subtotal), new Prisma.Decimal(0));
}

function party(
  heading: string,
  p: {
    code: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
  },
): PrintableParty {
  return {
    heading,
    code: p.code,
    name: p.name,
    address: p.address,
    phone: p.phone,
    email: p.email,
  };
}

/** Watermark hanya untuk dokumen yang belum final atau batal. */
function watermarkFor(status: string) {
  if (status === 'DRAFT') return 'DRAFT';
  if (status === 'CANCELLED') return 'DIBATALKAN';
  return undefined;
}

export function invoiceToPrintable(
  inv: InvoiceRow,
  now: Date = new Date(),
): PrintableDocument {
  const sales = inv.type === InvoiceType.SALES;
  const order = sales ? inv.salesOrder : inv.purchaseOrder;
  const partner = sales ? inv.customer : inv.supplier;
  const items = order?.items ?? [];
  const overdue = isOverdue(inv, now);
  const statusLabel = INVOICE_STATUS_LABEL[inv.status];

  return {
    kind: sales ? 'SALES_INVOICE' : 'PURCHASE_BILL',
    title: sales ? 'INVOICE' : 'TAGIHAN PEMBELIAN',
    number: inv.number,
    statusLabel: overdue ? `${statusLabel}, lewat jatuh tempo` : statusLabel,
    watermark: inv.status === InvoiceStatus.PAID ? 'LUNAS' : undefined,
    meta: [
      {
        label: sales ? 'Tanggal invoice' : 'Tanggal tagihan',
        value: formatDate(inv.issueDate),
      },
      { label: 'Jatuh tempo', value: formatDate(inv.dueDate) },
      { label: sales ? 'No. SO' : 'No. PO', value: order?.number ?? '-' },
    ],
    party: party(
      sales ? 'Ditagihkan kepada' : 'Supplier',
      partner ?? {
        code: '-',
        name: '-',
        address: null,
        phone: null,
        email: null,
      },
    ),
    items: mapItems(items),
    currencyCode: inv.currencyCode,
    exchangeRate: str(inv.exchangeRate),
    subtotal: str(sumSubtotal(items)),
    taxAmount: NO_TAX,
    total: str(inv.totalAmount),
    totalBase: str(inv.totalAmountBase),
    payment: {
      statusLabel,
      isOverdue: overdue,
      paidAmount: str(inv.paidAmount),
      outstandingAmount: str(outstanding(inv.totalAmount, inv.paidAmount)),
      outstandingAmountBase: str(
        outstandingBase(inv.totalAmount, inv.paidAmount, inv.exchangeRate),
      ),
      payments: inv.payments.map((p) => ({
        paidAt: p.paidAt,
        method: METHOD_LABEL[p.method],
        reference: p.reference,
        amount: str(p.amount),
      })),
    },
    notes: inv.notes,
    signatures: sales
      ? [
          { label: 'Penerima' },
          { label: 'Hormat kami', name: inv.createdBy.name },
        ]
      : [
          { label: 'Diperiksa oleh', name: inv.createdBy.name },
          { label: 'Disetujui oleh' },
        ],
  };
}

export function purchaseOrderToPrintable(
  po: PurchaseOrderRow,
): PrintableDocument {
  return {
    kind: 'PURCHASE_ORDER',
    title: 'PURCHASE ORDER',
    number: po.number,
    statusLabel: PO_STATUS_LABEL[po.status],
    watermark: watermarkFor(po.status),
    meta: [
      { label: 'Tanggal PO', value: formatDate(po.orderDate) },
      { label: 'Disetujui', value: formatDate(po.approvedAt) },
      {
        label: 'Gudang tujuan',
        value: `${po.warehouse.code} - ${po.warehouse.name}`,
      },
    ],
    party: party('Kepada (supplier)', po.supplier),
    items: mapItems(po.items),
    currencyCode: po.currencyCode,
    exchangeRate: str(po.exchangeRate),
    subtotal: str(sumSubtotal(po.items)),
    taxAmount: NO_TAX,
    total: str(po.totalAmount),
    totalBase: str(po.totalAmountBase),
    notes: po.notes,
    signatures: [
      { label: 'Dibuat oleh', name: po.createdBy.name },
      { label: 'Disetujui oleh', name: po.approvedBy?.name },
      { label: 'Supplier' },
    ],
  };
}

export function salesOrderToPrintable(so: SalesOrderRow): PrintableDocument {
  return {
    kind: 'SALES_ORDER',
    title: 'SALES ORDER',
    number: so.number,
    statusLabel: SO_STATUS_LABEL[so.status],
    watermark: watermarkFor(so.status),
    meta: [
      { label: 'Tanggal SO', value: formatDate(so.orderDate) },
      { label: 'Dikonfirmasi', value: formatDate(so.confirmedAt) },
      { label: 'Gudang', value: `${so.warehouse.code} - ${so.warehouse.name}` },
    ],
    party: party('Pelanggan', so.customer),
    items: mapItems(so.items),
    currencyCode: so.currencyCode,
    exchangeRate: str(so.exchangeRate),
    subtotal: str(sumSubtotal(so.items)),
    taxAmount: NO_TAX,
    total: str(so.totalAmount),
    totalBase: str(so.totalAmountBase),
    notes: so.notes,
    signatures: [
      { label: 'Dibuat oleh', name: so.createdBy.name },
      { label: 'Pelanggan' },
    ],
  };
}
