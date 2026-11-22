import { paginate, toOrderBy, toSkipTake } from './paginate.js';

describe('paginate utils', () => {
  it('toSkipTake menghitung offset', () => {
    expect(toSkipTake({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('paginate membungkus data + meta', () => {
    expect(paginate([1, 2], 25, { page: 1, limit: 10 }).meta).toEqual({
      page: 1, limit: 10, total: 25, totalPages: 3,
    });
  });

  it('toOrderBy pakai fallback kalau kolom tidak diizinkan', () => {
    expect(toOrderBy('passwordHash', ['name'] as const, 'name', 'asc')).toEqual({ name: 'asc' });
    expect(toOrderBy('name', ['name', 'sku'] as const, 'sku', 'desc')).toEqual({ name: 'desc' });
  });
});
