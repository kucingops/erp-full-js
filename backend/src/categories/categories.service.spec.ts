import { NotFoundException } from '@nestjs/common';
import {
  baseQuery,
  mockPrisma,
  type MockDelegate,
} from '../master-data/testing.js';
import { CategoriesService } from './categories.service.js';

describe('CategoriesService', () => {
  let category: MockDelegate;
  let service: CategoriesService;

  beforeEach(() => {
    const m = mockPrisma('category');
    category = m.delegate;
    service = new CategoriesService(m.prisma);
  });

  it('findAll: search nama + default sort name', async () => {
    await service.findAll({ ...baseQuery, search: 'minum', sortOrder: 'asc' });
    expect(category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'minum', mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        include: { _count: { select: { products: true } } },
      }),
    );
  });

  it('findAll tanpa search = tanpa filter', async () => {
    await service.findAll(baseQuery);
    expect(category.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('findOne 404', async () => {
    category.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  it('remove 404 tidak memanggil delete', async () => {
    category.findUnique.mockResolvedValue(null);
    await expect(service.remove('x')).rejects.toThrow(NotFoundException);
    expect(category.delete).not.toHaveBeenCalled();
  });

  it('update kategori yang ada', async () => {
    category.findUnique.mockResolvedValue({ id: 'c1', name: 'A' });
    await service.update('c1', { name: 'B' });
    expect(category.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { name: 'B' } }),
    );
  });
});
