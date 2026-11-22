import { docNumberPrefix, nextDocNumber } from './doc-number.js';

describe('doc-number', () => {
  it('prefix berisi tanggal YYYYMMDD', () => {
    expect(docNumberPrefix('PO', new Date(2026, 10, 2))).toBe('PO-20261102-');
  });

  it('mulai dari 0001 kalau belum ada dokumen hari ini', () => {
    expect(nextDocNumber('PO-20261122-', null)).toBe('PO-20261122-0001');
  });

  it('lanjut dari nomor terakhir', () => {
    expect(nextDocNumber('SO-20261122-', 'SO-20261122-0041')).toBe('SO-20261122-0042');
  });
});
