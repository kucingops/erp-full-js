import { Prisma } from '../generated/prisma/client.js';
import {
  InvoiceType,
  JournalSourceType,
  PaymentMethod,
  StockMovementType,
  StockReferenceType,
} from '../generated/prisma/enums.js';
import { ACC } from './chart-of-accounts.js';
import { purchaseUnitPriceBase } from './journal-posting.service.js';
import {
  invoiceJournal,
  isBalanced,
  paymentJournal,
  reverseLines,
  stockMovementJournal,
  type JournalDraft,
} from './posting-rules.js';

/** Ringkas draft jadi { kodeAkun: '+D' / '-K' } supaya assertion gampang dibaca. */
function summary(d: JournalDraft | null) {
  expect(d).not.toBeNull();
  expect(isBalanced(d!.lines)).toBe(true);
  return Object.fromEntries(
    d!.lines.map((l) => [l.accountCode, l.debit.gt(0) ? `D ${l.debit.toFixed(2)}` : `K ${l.credit.toFixed(2)}`]),
  );
}

const date = new Date('2026-11-22T00:00:00Z');

describe('posting rules', () => {
  describe('invoiceJournal', () => {
    it('invoice penjualan: Dr Piutang / Cr Penjualan (nilai IDR)', () => {
      const d = invoiceJournal({
        id: 'i1',
        number: 'INV-1',
        type: InvoiceType.SALES,
        issueDate: date,
        totalAmountBase: '1585000.00',
        partnerName: 'PT Maju',
      });
      expect(summary(d)).toEqual({ [ACC.RECEIVABLE]: 'D 1585000.00', [ACC.SALES]: 'K 1585000.00' });
      expect(d!.sourceType).toBe(JournalSourceType.SALES_INVOICE);
      expect(d!.sourceKey).toBe('INVOICE:i1');
      expect(d!.description).toContain('PT Maju');
    });

    it('tagihan supplier: Dr Hutang Belum Ditagih / Cr Hutang Usaha', () => {
      const d = invoiceJournal({
        id: 'b1',
        number: 'BILL-1',
        type: InvoiceType.PURCHASE,
        issueDate: date,
        totalAmountBase: 500,
      });
      expect(summary(d)).toEqual({ [ACC.GRNI]: 'D 500.00', [ACC.PAYABLE]: 'K 500.00' });
      expect(d!.sourceType).toBe(JournalSourceType.PURCHASE_BILL);
    });

    it('nilai 0 → tidak ada jurnal', () => {
      expect(
        invoiceJournal({ id: 'x', number: 'X', type: InvoiceType.SALES, issueDate: date, totalAmountBase: 0 }),
      ).toBeNull();
    });
  });

  describe('paymentJournal', () => {
    const pay = (over: Partial<Parameters<typeof paymentJournal>[0]> = {}) => ({
      id: 'p1',
      amount: '100',
      amountBase: '100',
      paidAt: date,
      method: PaymentMethod.TRANSFER,
      invoice: { number: 'INV-1', type: InvoiceType.SALES, exchangeRate: '1' },
      ...over,
    });

    it('terima pembayaran IDR via transfer: Dr Bank / Cr Piutang', () => {
      expect(summary(paymentJournal(pay()))).toEqual({ [ACC.BANK]: 'D 100.00', [ACC.RECEIVABLE]: 'K 100.00' });
    });

    it('CASH masuk ke akun Kas', () => {
      expect(summary(paymentJournal(pay({ method: PaymentMethod.CASH })))).toHaveProperty(ACC.CASH, 'D 100.00');
    });

    it('AR valas, kurs bayar naik → laba kurs (kredit 7100)', () => {
      // invoice USD 10 @15.000 = 150.000; dibayar @15.500 = 155.000
      const d = paymentJournal(
        pay({ amount: '10', amountBase: '155000', invoice: { number: 'INV-2', type: InvoiceType.SALES, exchangeRate: '15000' } }),
      );
      expect(summary(d)).toEqual({
        [ACC.BANK]: 'D 155000.00',
        [ACC.RECEIVABLE]: 'K 150000.00',
        [ACC.FX_GAIN_LOSS]: 'K 5000.00',
      });
    });

    it('AR valas, kurs bayar turun → rugi kurs (debit 7100)', () => {
      const d = paymentJournal(
        pay({ amount: '10', amountBase: '148000', invoice: { number: 'INV-2', type: InvoiceType.SALES, exchangeRate: '15000' } }),
      );
      expect(summary(d)).toHaveProperty(ACC.FX_GAIN_LOSS, 'D 2000.00');
    });

    it('AP: Dr Hutang (nilai buku) / Cr Bank (nilai bayar), kurs naik → rugi kurs', () => {
      const d = paymentJournal(
        pay({ amount: '10', amountBase: '155000', invoice: { number: 'BILL-1', type: InvoiceType.PURCHASE, exchangeRate: '15000' } }),
      );
      expect(summary(d)).toEqual({
        [ACC.PAYABLE]: 'D 150000.00',
        [ACC.BANK]: 'K 155000.00',
        [ACC.FX_GAIN_LOSS]: 'D 5000.00',
      });
    });
  });

  describe('stockMovementJournal', () => {
    const mv = (over: Partial<Parameters<typeof stockMovementJournal>[0]> = {}) => ({
      id: 'm1',
      type: StockMovementType.IN,
      quantity: 10,
      referenceType: StockReferenceType.PURCHASE_ORDER,
      referenceId: 'po1',
      createdAt: date,
      product: { sku: 'SKU1', name: 'Kopi', costPrice: '8000' },
      referenceNumber: 'PO-1',
      purchaseUnitPriceBase: '10000',
      ...over,
    });

    it('PO receive: persediaan harga standar, hutang belum ditagih harga PO, selisih ke 5300', () => {
      expect(summary(stockMovementJournal(mv()))).toEqual({
        [ACC.INVENTORY]: 'D 80000.00',
        [ACC.GRNI]: 'K 100000.00',
        [ACC.PURCHASE_PRICE_VARIANCE]: 'D 20000.00',
      });
    });

    it('PO receive lebih murah dari standar → selisih di kredit', () => {
      expect(summary(stockMovementJournal(mv({ purchaseUnitPriceBase: '7000' })))).toHaveProperty(
        ACC.PURCHASE_PRICE_VARIANCE,
        'K 10000.00',
      );
    });

    it('PO receive harga = standar → tanpa baris selisih', () => {
      expect(Object.keys(summary(stockMovementJournal(mv({ purchaseUnitPriceBase: '8000' }))))).toEqual([
        ACC.INVENTORY,
        ACC.GRNI,
      ]);
    });

    it('SO ship: Dr HPP / Cr Persediaan', () => {
      const d = stockMovementJournal(
        mv({ type: StockMovementType.OUT, quantity: -3, referenceType: StockReferenceType.SALES_ORDER, purchaseUnitPriceBase: null }),
      );
      expect(summary(d)).toEqual({ [ACC.COGS]: 'D 24000.00', [ACC.INVENTORY]: 'K 24000.00' });
    });

    it('adjustment plus & minus ke akun selisih persediaan', () => {
      const plus = stockMovementJournal(
        mv({ type: StockMovementType.ADJUSTMENT, quantity: 2, referenceType: StockReferenceType.ADJUSTMENT }),
      );
      expect(summary(plus)).toEqual({ [ACC.INVENTORY]: 'D 16000.00', [ACC.INVENTORY_ADJUSTMENT]: 'K 16000.00' });
      const minus = stockMovementJournal(
        mv({ type: StockMovementType.ADJUSTMENT, quantity: -1, referenceType: StockReferenceType.ADJUSTMENT }),
      );
      expect(summary(minus)).toEqual({ [ACC.INVENTORY_ADJUSTMENT]: 'D 8000.00', [ACC.INVENTORY]: 'K 8000.00' });
    });

    it('costPrice 0 pada SO ship → tidak ada jurnal', () => {
      expect(
        stockMovementJournal(
          mv({
            type: StockMovementType.OUT,
            quantity: -3,
            referenceType: StockReferenceType.SALES_ORDER,
            product: { sku: 'S', name: 'N', costPrice: 0 },
          }),
        ),
      ).toBeNull();
    });

    it('movement tanpa efek akuntansi (mis. transfer antar gudang) → null', () => {
      expect(
        stockMovementJournal(
          mv({ type: StockMovementType.IN, referenceType: 'STOCK_TRANSFER' as StockReferenceType }),
        ),
      ).toBeNull();
    });
  });

  it('reverseLines menukar debit dan kredit', () => {
    const lines = [
      { debit: new Prisma.Decimal(5), credit: new Prisma.Decimal(0) },
      { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(5) },
    ];
    expect(reverseLines(lines).map((l) => [l.debit.toNumber(), l.credit.toNumber()])).toEqual([
      [0, 5],
      [5, 0],
    ]);
  });

  it('purchaseUnitPriceBase: rata-rata baris PO produk sama x kurs', () => {
    const po = {
      exchangeRate: '2',
      items: [
        { productId: 'a', quantity: 2, subtotal: '20' },
        { productId: 'a', quantity: 3, subtotal: '45' },
        { productId: 'b', quantity: 1, subtotal: '99' },
      ],
    };
    expect(purchaseUnitPriceBase(po, 'a')!.toNumber()).toBe(26); // 65/5*2
    expect(purchaseUnitPriceBase(po, 'z')).toBeNull();
  });
});
