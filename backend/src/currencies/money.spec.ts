import { crossConvert, toBase, wibDate } from './money.js';

describe('money helpers', () => {
  it('toBase: amount * rate dibulatkan 2 desimal HALF_UP', () => {
    expect(toBase('100.50', '15750.123456').toString()).toBe('1582887.41');
    expect(toBase(1, '0.005').toString()).toBe('0.01');
    expect(toBase('2500', 1).toString()).toBe('2500');
  });

  it('toBase tidak kena error floating point', () => {
    // 0.1 * 3 di float = 0.30000000000000004
    expect(toBase('0.1', 3).toString()).toBe('0.3');
  });

  it('crossConvert lewat base: USD → SGD', () => {
    // 1 USD = 16000 IDR, 1 SGD = 12000 IDR → 30 USD = 40 SGD
    expect(crossConvert(30, 16000, 12000).toString()).toBe('40');
  });

  it('wibDate: ambil tanggal kalender di WIB', () => {
    expect(wibDate(new Date('2026-11-21T18:30:00Z')).toISOString()).toBe('2026-11-22T00:00:00.000Z');
    expect(wibDate(new Date('2026-11-22T16:59:00Z')).toISOString()).toBe('2026-11-22T00:00:00.000Z');
  });
});
