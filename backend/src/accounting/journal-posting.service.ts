import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client.js';
import { StockReferenceType } from '../generated/prisma/enums.js';
import { wibDate } from '../currencies/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ensureSystemAccounts } from './system-accounts.js';
import { insertEntry, JOURNAL_LOCK_KEY, journalNumberer } from './journal-writer.js';
import {
  compareDrafts,
  invoiceJournal,
  paymentJournal,
  reverseLines,
  sourceKey,
  stockMovementJournal,
  type JournalDraft,
} from './posting-rules.js';

type Tx = Prisma.TransactionClient;
const BATCH = 2000;

export interface SyncResult {
  /** false = sync lain sedang jalan, kali ini dilewati */
  ran: boolean;
  posted: number;
  reversed: number;
}

/**
 * Posting jurnal otomatis dengan pola "sync idempotent" (mirip outbox/poller):
 * cari dokumen yang BELUM punya jurnal (anti-join via `source_key`), buat jurnalnya;
 * cari jurnal yang dokumennya SUDAH DIHAPUS (invoice/payment), buat jurnal pembalik.
 *
 * Kenapa bukan dipanggil langsung dari InvoicesService / InventoryService?
 * Supaya modul accounting tidak mengubah modul lain sama sekali (minim konflik, modul lain
 * tidak perlu tahu akuntansi). Trade-off: jurnal tidak satu transaksi dengan dokumennya,
 * jadi ada jeda. Jeda ditutup dengan: sync otomatis sebelum laporan GL/neraca saldo dibaca,
 * interval berkala, dan tombol "Sinkronkan". Detail: docs/accounting.md.
 */
@Injectable()
export class JournalPostingService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JournalPostingService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const ms = Number(this.config.get('JOURNAL_SYNC_INTERVAL_MS') ?? 60_000);
    if (ms > 0) {
      this.timer = setInterval(() => {
        this.sync().catch((e: unknown) => this.logger.error(`Sync jurnal gagal: ${String(e)}`));
      }, ms);
      this.timer.unref?.();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sync(): Promise<SyncResult> {
    return this.prisma.$transaction(
      async (tx) => {
        // try-lock: kalau sync lain sedang jalan, jangan antre (laporan tetap bisa dibaca).
        const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${JOURNAL_LOCK_KEY}) AS ok`;
        if (!lock?.ok) return { ran: false, posted: 0, reversed: 0 };

        const accounts = await ensureSystemAccounts(tx);
        const drafts = [
          ...(await this.invoiceDrafts(tx)),
          ...(await this.paymentDrafts(tx)),
          ...(await this.stockDrafts(tx)),
        ].sort(compareDrafts);
        const orphans = await this.orphanEntries(tx);
        if (drafts.length === 0 && orphans.length === 0) return { ran: true, posted: 0, reversed: 0 };

        const next = await journalNumberer(tx);
        for (const d of drafts) {
          await insertEntry(tx, next(), {
            ...d,
            lines: d.lines.map((l) => ({ ...l, accountId: accountId(accounts, l.accountCode) })),
          });
        }
        const now = wibDate(new Date());
        for (const o of orphans) {
          await insertEntry(tx, next(), {
            date: now,
            description: `Pembalik (dokumen dihapus): ${o.description}`,
            sourceType: o.sourceType,
            sourceId: o.sourceId,
            sourceNumber: o.sourceNumber,
            sourceKey: sourceKey.reversal(o.sourceKey!),
            reversalOfId: o.id,
            lines: reverseLines(o.lines),
          });
        }
        if (drafts.length || orphans.length) {
          this.logger.log(`Jurnal otomatis: ${drafts.length} diposting, ${orphans.length} dibalik`);
        }
        return { ran: true, posted: drafts.length, reversed: orphans.length };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  // ---------- kandidat ----------

  private async invoiceDrafts(tx: Tx): Promise<JournalDraft[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT i.id FROM invoices i
      WHERE NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.source_key = 'INVOICE:' || i.id)
      ORDER BY i.issue_date LIMIT ${BATCH}`;
    if (!rows.length) return [];
    const invoices = await tx.invoice.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: { customer: { select: { name: true } }, supplier: { select: { name: true } } },
    });
    return invoices
      .map((i) =>
        invoiceJournal({ ...i, partnerName: i.customer?.name ?? i.supplier?.name }),
      )
      .filter((d): d is JournalDraft => d !== null);
  }

  private async paymentDrafts(tx: Tx): Promise<JournalDraft[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM payments p
      WHERE NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.source_key = 'PAYMENT:' || p.id)
      ORDER BY p.paid_at LIMIT ${BATCH}`;
    if (!rows.length) return [];
    const payments = await tx.payment.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: { invoice: { select: { number: true, type: true, exchangeRate: true } } },
    });
    return payments.map(paymentJournal).filter((d): d is JournalDraft => d !== null);
  }

  /**
   * Movement yang berefek akuntansi saja (PO receive, SO ship, adjustment).
   * Movement non-PO dengan costPrice 0 dilewati di SQL (nilainya 0), supaya tidak
   * memenuhi batch tiap sync; begitu costPrice diisi, movement itu ikut diposting.
   */
  private async stockDrafts(tx: Tx): Promise<JournalDraft[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT m.id FROM stock_movements m
      JOIN products p ON p.id = m.product_id
      WHERE (m.type = 'ADJUSTMENT' OR m.reference_type IN ('PURCHASE_ORDER', 'SALES_ORDER'))
        AND (p.cost_price <> 0 OR m.reference_type = 'PURCHASE_ORDER')
        AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.source_key = 'STOCK:' || m.id)
      ORDER BY m.created_at LIMIT ${BATCH}`;
    if (!rows.length) return [];
    const movements = await tx.stockMovement.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: { product: { select: { sku: true, name: true, costPrice: true } } },
    });

    const refIds = (t: StockReferenceType) => [
      ...new Set(movements.filter((m) => m.referenceType === t && m.referenceId).map((m) => m.referenceId!)),
    ];
    const [pos, sos] = await Promise.all([
      tx.purchaseOrder.findMany({
        where: { id: { in: refIds(StockReferenceType.PURCHASE_ORDER) } },
        select: {
          id: true,
          number: true,
          exchangeRate: true,
          items: { select: { productId: true, quantity: true, subtotal: true } },
        },
      }),
      tx.salesOrder.findMany({
        where: { id: { in: refIds(StockReferenceType.SALES_ORDER) } },
        select: { id: true, number: true },
      }),
    ]);
    const poById = new Map(pos.map((p) => [p.id, p]));
    const soById = new Map(sos.map((s) => [s.id, s]));

    return movements
      .map((m) => {
        const po = m.referenceType === StockReferenceType.PURCHASE_ORDER ? poById.get(m.referenceId ?? '') : undefined;
        const so = m.referenceType === StockReferenceType.SALES_ORDER ? soById.get(m.referenceId ?? '') : undefined;
        return stockMovementJournal({
          ...m,
          referenceNumber: po?.number ?? so?.number ?? null,
          purchaseUnitPriceBase: po ? purchaseUnitPriceBase(po, m.productId) : null,
        });
      })
      .filter((d): d is JournalDraft => d !== null);
  }

  /** Jurnal invoice/payment yang dokumennya sudah dihapus dan belum dibalik. */
  private async orphanEntries(tx: Tx) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT j.id FROM journal_entries j
      WHERE j.reversal_of_id IS NULL
        AND j.source_key IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM journal_entries r WHERE r.reversal_of_id = j.id)
        AND (
          (j.source_type IN ('SALES_INVOICE', 'PURCHASE_BILL')
             AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = j.source_id))
          OR (j.source_type = 'PAYMENT'
             AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = j.source_id))
        )
      ORDER BY j.date LIMIT ${BATCH}`;
    if (!rows.length) return [];
    return tx.journalEntry.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
      orderBy: { date: 'asc' },
    });
  }
}

function accountId(map: Map<string, string>, code: string) {
  const id = map.get(code);
  if (!id) throw new Error(`Akun sistem ${code} tidak ditemukan`);
  return id;
}

/**
 * Harga beli per unit dalam IDR untuk produk di PO = (total subtotal / total qty) x kurs PO.
 * Rata-rata dipakai kalau produk yang sama muncul di beberapa baris PO.
 */
export function purchaseUnitPriceBase(
  po: { exchangeRate: Prisma.Decimal | string | number; items: { productId: string; quantity: number; subtotal: Prisma.Decimal | string | number }[] },
  productId: string,
) {
  const items = po.items.filter((i) => i.productId === productId);
  const qty = items.reduce((s, i) => s + i.quantity, 0);
  if (qty === 0) return null;
  const subtotal = items.reduce((s, i) => s.add(new Prisma.Decimal(i.subtotal)), new Prisma.Decimal(0));
  return subtotal.div(qty).mul(new Prisma.Decimal(po.exchangeRate));
}
