import { InvoiceStatus } from '../generated/prisma/enums.js';
import { addDays, agingBuckets, deriveStatus, isOverdue, outstanding, todayWib } from './invoice-math.js';

describe('invoice-math', () => {
  describe('deriveStatus', () => {
    it.each([
      ['1000', '0', InvoiceStatus.UNPAID],
      ['1000', '0.01', InvoiceStatus.PARTIAL],
      ['1000', '999.99', InvoiceStatus.PARTIAL],
      ['1000', '1000', InvoiceStatus.PAID],
    ])('total %s, bayar %s -> %s', (total, paid, expected) => {
      expect(deriveStatus(total, paid)).toBe(expected);
    });

    it('pakai Decimal: total 0.3 dibayar 0.1 + 0.2 = PAID (float biasa jadi 0.30000000000000004)', () => {
      const paid = outstanding('0.1', '0').add('0.2');
      expect(deriveStatus('0.3', paid)).toBe(InvoiceStatus.PAID);
      expect(outstanding('0.3', '0.1').toString()).toBe('0.2');
    });
  });

  describe('tanggal (WIB)', () => {
    it('todayWib: 23:30 UTC tgl 21 sudah tgl 22 di WIB', () => {
      expect(todayWib(new Date('2026-11-21T23:30:00Z')).toISOString()).toBe('2026-11-22T00:00:00.000Z');
    });

    it('addDays melewati akhir bulan', () => {
      expect(addDays(new Date('2026-11-22'), 30).toISOString().slice(0, 10)).toBe('2026-12-22');
    });

    it('jatuh tempo hari ini belum overdue, kemarin sudah, yang lunas tidak pernah', () => {
      const now = new Date('2026-11-22T05:00:00Z');
      expect(isOverdue({ dueDate: new Date('2026-11-22'), status: InvoiceStatus.UNPAID }, now)).toBe(false);
      expect(isOverdue({ dueDate: new Date('2026-11-21'), status: InvoiceStatus.PARTIAL }, now)).toBe(true);
      expect(isOverdue({ dueDate: new Date('2026-11-21'), status: InvoiceStatus.PAID }, now)).toBe(false);
    });
  });

  it('agingBuckets mengelompokkan sisa tagihan per umur telat', () => {
    const now = new Date('2026-11-22T05:00:00Z');
    const result = agingBuckets(
      [
        { dueDate: new Date('2026-11-30'), totalAmount: '100', paidAmount: '0' }, // belum jatuh tempo
        { dueDate: new Date('2026-11-12'), totalAmount: '200', paidAmount: '50' }, // telat 10 hari
        { dueDate: new Date('2026-10-01'), totalAmount: '300', paidAmount: '0' }, // telat 52 hari
        { dueDate: new Date('2026-08-01'), totalAmount: '400', paidAmount: '0' }, // telat > 90
      ],
      now,
    );
    expect(result).toEqual({
      current: '100.00',
      d1_30: '150.00',
      d31_60: '300.00',
      d61_90: '0.00',
      d90plus: '400.00',
    });
  });
});
