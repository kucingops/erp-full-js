import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { InvoiceStatus, PaymentMethod, type InvoiceType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { docNumberPrefix, nextDocNumber } from '../common/utils/doc-number.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type { CreateInvoiceDto, CreatePaymentDto, InvoiceQueryDto } from './dto/invoice.dto.js';
import { BASE_CURRENCY, toBase } from '../currencies/index.js';
import { INVOICE_KINDS, type InvoiceKind } from './invoice-kind.js';
import {
  addDays,
  agingBuckets,
  deriveStatus,
  isOverdue,
  outstanding,
  outstandingBase,
  todayWib,
} from './invoice-math.js';

const SORTABLE = ['number', 'issueDate', 'dueDate', 'status', 'totalAmount', 'totalAmountBase', 'createdAt'] as const;
const DEFAULT_TERM_DAYS = 30;
const OPEN = [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL];

const partner = { select: { id: true, code: true, name: true } } as const;
const orderRef = { select: { id: true, number: true, orderDate: true } } as const;

const listInclude = {
  customer: partner,
  supplier: partner,
  salesOrder: orderRef,
  purchaseOrder: orderRef,
  _count: { select: { payments: true } },
} satisfies Prisma.InvoiceInclude;

const itemInclude = {
  include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
} as const;

const detailInclude = {
  customer: partner,
  supplier: partner,
  salesOrder: { select: { ...orderRef.select, items: itemInclude } },
  purchaseOrder: { select: { ...orderRef.select, items: itemInclude } },
  createdBy: { select: { id: true, name: true } },
  payments: {
    orderBy: { paidAt: 'asc' },
    include: { createdBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.InvoiceInclude;

/** Tambah field hitungan yang dipakai FE (tidak disimpan di DB). */
function withComputed<
  T extends {
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    exchangeRate: Prisma.Decimal;
    dueDate: Date;
    status: InvoiceStatus;
  },
>(inv: T) {
  return {
    ...inv,
    outstandingAmount: outstanding(inv.totalAmount, inv.paidAmount),
    /** Sisa tagihan dalam IDR (kurs invoice) */
    outstandingAmountBase: outstandingBase(inv.totalAmount, inv.paidAmount, inv.exchangeRate),
    isOverdue: isOverdue(inv),
  };
}

/**
 * Satu service untuk invoice penjualan (AR) dan tagihan pembelian (AP).
 * Perbedaannya ada di `InvoiceKind` (strategy), dipilih dari `type`.
 *
 * Alur: order SHIPPED/RECEIVED → buat invoice (UNPAID) → catat pembayaran
 * (PARTIAL, lalu PAID kalau sisa = 0). Pembayaran bisa dihapus (salah input),
 * status dihitung ulang. Invoice hanya bisa dihapus kalau belum ada pembayaran.
 */
@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  private kind(type: InvoiceType): InvoiceKind {
    return INVOICE_KINDS[type];
  }

  async findAll(type: InvoiceType, query: InvoiceQueryDto) {
    const k = this.kind(type);
    const today = todayWib();
    const statusFilter: Prisma.InvoiceWhereInput =
      query.overdue || query.outstanding
        ? { status: { in: query.status ? OPEN.filter((s) => s === query.status) : OPEN } }
        : query.status
          ? { status: query.status }
          : {};
    const where: Prisma.InvoiceWhereInput = {
      type,
      ...statusFilter,
      ...(query.overdue ? { dueDate: { lt: today } } : {}),
      ...(query.partnerId ? { [k.partnerField]: query.partnerId } : {}),
      ...(query.currencyCode ? { currencyCode: query.currencyCode } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: 'insensitive' } },
              { customer: { name: { contains: query.search, mode: 'insensitive' } } },
              { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
              { salesOrder: { number: { contains: query.search, mode: 'insensitive' } } },
              { purchaseOrder: { number: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: listInclude,
        orderBy: toOrderBy(query.sortBy, SORTABLE, 'createdAt', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginate(rows.map(withComputed), total, query);
  }

  async findOne(type: InvoiceType, id: string) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, type }, include: detailInclude });
    if (!inv) throw new NotFoundException(`${this.kind(type).label} tidak ditemukan`);
    return withComputed(inv);
  }

  candidates(type: InvoiceType, search?: string) {
    return this.kind(type).listCandidates(this.prisma, search);
  }

  async create(type: InvoiceType, dto: CreateInvoiceDto, user: AuthUser) {
    const k = this.kind(type);
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : todayWib();
    const dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : addDays(issueDate, dto.termDays ?? DEFAULT_TERM_DAYS);
    if (dueDate < issueDate) {
      throw new BadRequestException('Jatuh tempo tidak boleh sebelum tanggal invoice');
    }

    // Nomor bisa bentrok kalau 2 invoice dibuat bersamaan → retry. Order yang sama
    // ditagih dua kali juga kena unique (order_id) → percobaan berikutnya dapat 409.
    for (let attempt = 0; ; attempt++) {
      const order = await k.findOrder(this.prisma, dto.orderId);
      if (!order) throw new NotFoundException(`${k.orderLabel} tidak ditemukan`);
      if (!order.ready) {
        throw new BadRequestException(
          `${k.orderLabel} ${order.number} berstatus ${order.status}, baru bisa ditagih setelah ${k.readyStatus}`,
        );
      }
      const existing = await this.prisma.invoice.findFirst({
        where: { [k.orderField]: order.id },
        select: { number: true },
      });
      if (existing) {
        throw new ConflictException(`${k.orderLabel} ${order.number} sudah punya ${existing.number}`);
      }
      // Mata uang selalu = order. Kurs default = kurs order (bukan kurs tanggal invoice):
      // invoice adalah realisasi order, dan menagih order lama tidak boleh gagal hanya karena
      // kurs tanggal invoice belum diinput / mata uangnya sudah dinonaktifkan.
      const exchangeRate = docRate(order.currencyCode, dto.exchangeRate, order.exchangeRate);
      try {
        const inv = await this.prisma.invoice.create({
          data: {
            type,
            number: await this.generateNumber(k.prefix, issueDate),
            [k.orderField]: order.id,
            [k.partnerField]: order.partnerId,
            issueDate,
            dueDate,
            totalAmount: order.totalAmount,
            currencyCode: order.currencyCode,
            exchangeRate,
            totalAmountBase: toBase(order.totalAmount, exchangeRate),
            notes: dto.notes,
            createdById: user.id,
          } as Prisma.InvoiceUncheckedCreateInput,
          include: detailInclude,
        });
        return withComputed(inv);
      } catch (e) {
        const isUnique = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!isUnique || attempt >= 2) throw e;
      }
    }
  }

  /** Hapus hanya kalau belum ada pembayaran (kalau sudah, hapus pembayarannya dulu). */
  async remove(type: InvoiceType, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, type },
      include: { _count: { select: { payments: true } } },
    });
    if (!inv) throw new NotFoundException(`${this.kind(type).label} tidak ditemukan`);
    if (inv._count.payments > 0) {
      throw new BadRequestException('Tidak bisa dihapus: sudah ada pembayaran');
    }
    await this.prisma.invoice.delete({ where: { id } });
  }

  /**
   * Catat pembayaran. Baris invoice dikunci (`SELECT ... FOR UPDATE`) supaya dua
   * pembayaran barengan tidak sama-sama lolos cek "tidak melebihi sisa".
   * Mirip `@Lock(PESSIMISTIC_WRITE)` di JPA.
   */
  async addPayment(type: InvoiceType, id: string, dto: CreatePaymentDto, user: AuthUser) {
    const amount = new Prisma.Decimal(dto.amount);
    await this.prisma.$transaction(async (tx) => {
      const inv = await this.lockInvoice(tx, type, id);
      const rest = outstanding(inv.totalAmount, inv.paidAmount);
      if (rest.lte(0)) throw new BadRequestException(`${inv.number} sudah lunas`);
      if (amount.gt(rest)) {
        throw new BadRequestException(
          `Pembayaran ${amount.toFixed(2)} melebihi sisa tagihan ${rest.toFixed(2)}`,
        );
      }
      // Payment dicatat dalam mata uang invoice. Kurs default = kurs invoice.
      const exchangeRate = docRate(inv.currencyCode, dto.exchangeRate, inv.exchangeRate);
      await tx.payment.create({
        data: {
          invoiceId: id,
          amount,
          exchangeRate,
          amountBase: toBase(amount, exchangeRate),
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          method: dto.method ?? PaymentMethod.TRANSFER,
          reference: dto.reference,
          notes: dto.notes,
          createdById: user.id,
        },
      });
      const paid = inv.paidAmount.add(amount);
      await tx.invoice.update({
        where: { id },
        data: { paidAmount: paid, status: deriveStatus(inv.totalAmount, paid) },
      });
    });
    return this.findOne(type, id);
  }

  /** Hapus pembayaran (koreksi salah input). Status dihitung ulang. */
  async removePayment(type: InvoiceType, id: string, paymentId: string) {
    await this.prisma.$transaction(async (tx) => {
      const inv = await this.lockInvoice(tx, type, id);
      const payment = await tx.payment.findFirst({ where: { id: paymentId, invoiceId: id } });
      if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan');
      await tx.payment.delete({ where: { id: paymentId } });
      const paid = inv.paidAmount.sub(payment.amount);
      await tx.invoice.update({
        where: { id },
        data: { paidAmount: paid, status: deriveStatus(inv.totalAmount, paid) },
      });
    });
    return this.findOne(type, id);
  }

  /**
   * Ringkasan outstanding: total sisa, overdue, aging, dan 5 partner dengan sisa terbesar.
   * Semua angka dalam IDR (sisa x kurs invoice) karena invoice bisa beda mata uang;
   * `byCurrency` memberi rincian sisa per mata uang asli.
   */
  async summary(type: InvoiceType) {
    const k = this.kind(type);
    const open = await this.prisma.invoice.findMany({
      where: { type, status: { in: OPEN } },
      select: {
        dueDate: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        currencyCode: true,
        exchangeRate: true,
        customer: partner,
        supplier: partner,
      },
    });
    let totalOutstanding = new Prisma.Decimal(0);
    let overdueAmount = new Prisma.Decimal(0);
    let overdueCount = 0;
    const byCurrency = new Map<
      string,
      { currencyCode: string; outstanding: Prisma.Decimal; outstandingBase: Prisma.Decimal; count: number }
    >();
    const byPartner = new Map<string, { id: string; code: string; name: string; outstanding: Prisma.Decimal; count: number }>();
    for (const inv of open) {
      const rest = outstandingBase(inv.totalAmount, inv.paidAmount, inv.exchangeRate);
      const bc = byCurrency.get(inv.currencyCode) ?? {
        currencyCode: inv.currencyCode,
        outstanding: new Prisma.Decimal(0),
        outstandingBase: new Prisma.Decimal(0),
        count: 0,
      };
      bc.outstanding = bc.outstanding.add(outstanding(inv.totalAmount, inv.paidAmount));
      bc.outstandingBase = bc.outstandingBase.add(rest);
      bc.count++;
      byCurrency.set(inv.currencyCode, bc);
      totalOutstanding = totalOutstanding.add(rest);
      if (isOverdue(inv)) {
        overdueAmount = overdueAmount.add(rest);
        overdueCount++;
      }
      const p = k.partnerField === 'customerId' ? inv.customer : inv.supplier;
      if (p) {
        const cur = byPartner.get(p.id) ?? { ...p, outstanding: new Prisma.Decimal(0), count: 0 };
        cur.outstanding = cur.outstanding.add(rest);
        cur.count++;
        byPartner.set(p.id, cur);
      }
    }
    const topPartners = [...byPartner.values()]
      .sort((a, b) => b.outstanding.comparedTo(a.outstanding))
      .slice(0, 5)
      .map((p) => ({ ...p, outstanding: p.outstanding.toFixed(2) }));
    return {
      baseCurrency: BASE_CURRENCY,
      openCount: open.length,
      totalOutstanding: totalOutstanding.toFixed(2),
      overdueCount,
      overdueAmount: overdueAmount.toFixed(2),
      aging: agingBuckets(open),
      topPartners,
      byCurrency: [...byCurrency.values()]
        .sort((a, b) => b.outstandingBase.comparedTo(a.outstandingBase))
        .map((c) => ({
          ...c,
          outstanding: c.outstanding.toFixed(2),
          outstandingBase: c.outstandingBase.toFixed(2),
        })),
    };
  }

  // ---------- helper ----------

  private async lockInvoice(tx: Prisma.TransactionClient, type: InvoiceType, id: string) {
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`;
    const inv = await tx.invoice.findFirst({ where: { id, type } });
    if (!inv) throw new NotFoundException(`${this.kind(type).label} tidak ditemukan`);
    return inv;
  }

  private async generateNumber(prefix: string, date: Date) {
    const dayPrefix = docNumberPrefix(prefix, date);
    const last = await this.prisma.invoice.findFirst({
      where: { number: { startsWith: dayPrefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return nextDocNumber(dayPrefix, last?.number);
  }
}

/** Kurs dokumen: IDR selalu 1; selain itu override user, kalau tidak ada pakai `fallback`. */
function docRate(currencyCode: string, override: number | undefined, fallback: Prisma.Decimal) {
  if (currencyCode === BASE_CURRENCY) return new Prisma.Decimal(1);
  return override != null ? new Prisma.Decimal(override) : new Prisma.Decimal(fallback);
}
