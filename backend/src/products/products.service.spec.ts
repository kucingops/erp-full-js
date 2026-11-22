import { NotFoundException } from '@nestjs/common';
import {
  baseQuery,
  mockPrisma,
  type MockDelegate,
} from '../master-data/testing.js';
import { ProductsService } from './products.service.js';

describe('ProductsService', () => {
  let product: MockDelegate;
  let service: ProductsService;
  const existing = { id: 'p1', sku: 'KOPI-001', name: 'Kopi' };

  beforeEach(() => {
    const m = mockPrisma('product');
    product = m.delegate;
    service = new ProductsService(m.prisma);
  });

  describe('findAll', () => {
    it('membungkus hasil ke { data, meta } dengan skip/take dari page', async () => {
      product.findMany.mockResolvedValue([existing]);
      product.count.mockResolvedValue(21);

      const res = await service.findAll({ ...baseQuery, page: 3 });

      expect(res).toEqual({
        data: [existing],
        meta: { page: 3, limit: 10, total: 21, totalPages: 3 },
      });
      expect(product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('search ke sku & nama, plus filter kategori dan status', async () => {
      await service.findAll({
        ...baseQuery,
        search: 'kopi',
        categoryId: 'c1',
        isActive: false,
      });

      const { where } = product.findMany.mock.calls[0][0];
      expect(where).toEqual({
        OR: [
          { sku: { contains: 'kopi', mode: 'insensitive' } },
          { name: { contains: 'kopi', mode: 'insensitive' } },
        ],
        categoryId: 'c1',
        isActive: false,
      });
      expect(product.count).toHaveBeenCalledWith({ where });
    });

    it('sortBy di luar whitelist jatuh ke createdAt', async () => {
      await service.findAll({
        ...baseQuery,
        sortBy: 'description',
        sortOrder: 'asc',
      });
      expect(product.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'asc',
      });
    });

    it('sortBy salePrice diizinkan', async () => {
      await service.findAll({ ...baseQuery, sortBy: 'salePrice' });
      expect(product.findMany.mock.calls[0][0].orderBy).toEqual({
        salePrice: 'desc',
      });
    });
  });

  it('findOne 404 kalau tidak ada', async () => {
    product.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  it('create meneruskan DTO dan ikut include kategori', async () => {
    const dto = {
      sku: 'KOPI-002',
      name: 'Kopi 2',
      costPrice: 1000,
      salePrice: 1500,
    };
    product.create.mockResolvedValue({ id: 'p2', ...dto });

    await service.create(dto);

    expect(product.create).toHaveBeenCalledWith({
      data: dto,
      include: { category: { select: { id: true, name: true } } },
    });
  });

  it('update cek keberadaan dulu, lalu update', async () => {
    product.findUnique.mockResolvedValue(existing);
    product.update.mockResolvedValue({ ...existing, isActive: false });

    await service.update('p1', { isActive: false });

    expect(product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: { isActive: false },
      }),
    );
  });

  it('update 404 tanpa memanggil prisma.update', async () => {
    product.findUnique.mockResolvedValue(null);
    await expect(service.update('x', { name: 'A' })).rejects.toThrow(
      NotFoundException,
    );
    expect(product.update).not.toHaveBeenCalled();
  });

  it('remove menghapus kalau ada', async () => {
    product.findUnique.mockResolvedValue(existing);
    await service.remove('p1');
    expect(product.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});
