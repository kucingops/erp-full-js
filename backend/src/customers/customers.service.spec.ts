import { NotFoundException } from '@nestjs/common';
import {
  baseQuery,
  mockPrisma,
  type MockDelegate,
} from '../master-data/testing.js';
import { CustomersService } from './customers.service.js';

describe('CustomersService', () => {
  let delegate: MockDelegate;
  let service: CustomersService;
  const existing = { id: 'id-1', code: 'X-001', name: 'Contoh' };

  beforeEach(() => {
    const m = mockPrisma('customer');
    delegate = m.delegate;
    service = new CustomersService(m.prisma);
  });

  it('findAll: search ke beberapa kolom + filter isActive', async () => {
    delegate.findMany.mockResolvedValue([existing]);
    delegate.count.mockResolvedValue(1);

    const res = await service.findAll({
      ...baseQuery,
      search: 'maju',
      isActive: true,
    });

    const { where } = delegate.findMany.mock.calls[0][0];
    expect(where.isActive).toBe(true);
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { code: { contains: 'maju', mode: 'insensitive' } },
        { name: { contains: 'maju', mode: 'insensitive' } },
      ]),
    );
    expect(res.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });

  it('findAll tanpa filter = where kosong', async () => {
    await service.findAll(baseQuery);
    expect(delegate.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('sortBy yang tidak diizinkan diabaikan', async () => {
    await service.findAll({ ...baseQuery, sortBy: 'isActive; DROP TABLE' });
    expect(delegate.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('findOne 404', async () => {
    delegate.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  it('create meneruskan DTO', async () => {
    const dto = { code: 'X-002', name: 'Baru' };
    await service.create(dto);
    expect(delegate.create).toHaveBeenCalledWith({ data: dto });
  });

  it('update & remove cek keberadaan dulu', async () => {
    delegate.findUnique.mockResolvedValue(existing);
    await service.update('id-1', { isActive: false });
    await service.remove('id-1');
    expect(delegate.update).toHaveBeenCalledWith({
      where: { id: 'id-1' },
      data: { isActive: false },
    });
    expect(delegate.delete).toHaveBeenCalledWith({ where: { id: 'id-1' } });
  });

  it('remove 404 tidak memanggil delete', async () => {
    delegate.findUnique.mockResolvedValue(null);
    await expect(service.remove('x')).rejects.toThrow(NotFoundException);
    expect(delegate.delete).not.toHaveBeenCalled();
  });
});
