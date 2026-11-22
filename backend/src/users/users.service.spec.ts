import { BadRequestException, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { PrismaService } from '../prisma/prisma.service.js';
import { Role } from '../generated/prisma/enums.js';
import { baseQuery } from '../master-data/testing.js';
import { UsersService } from './users.service.js';

const admin = { id: 'admin-1', email: 'admin@erp.local', role: Role.ADMIN };
const existing = {
  id: 'user-2',
  email: 'sales@erp.local',
  name: 'Sales',
  role: Role.SALES,
  isActive: true,
};

function setup() {
  const user = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findUnique: vi.fn().mockResolvedValue(existing),
    create: vi.fn().mockResolvedValue(existing),
    update: vi.fn().mockResolvedValue(existing),
  };
  const refreshToken = { updateMany: vi.fn().mockResolvedValue({ count: 2 }) };
  const prisma = {
    user,
    refreshToken,
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return {
    user,
    refreshToken,
    prisma,
    service: new UsersService(prisma as unknown as PrismaService),
  };
}

describe('UsersService', () => {
  it('findAll: filter isActive, role, search', async () => {
    const { user, service } = setup();
    await service.findAll({ ...baseQuery, isActive: false, role: Role.SALES, search: 'bud' });
    const { where, select } = user.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ isActive: false, role: Role.SALES });
    expect(where.OR).toHaveLength(2);
    expect(select.passwordHash).toBeUndefined();
  });

  it('create: password di-hash, tidak disimpan plain', async () => {
    const { user, service } = setup();
    await service.create({ email: 'a@b.c', name: 'Ab', password: 'Rahasia123!', role: Role.SALES });
    const { data } = user.create.mock.calls[0][0];
    expect(data.password).toBeUndefined();
    expect(await bcrypt.compare('Rahasia123!', data.passwordHash)).toBe(true);
  });

  it('update: admin tidak bisa menurunkan role sendiri', async () => {
    const { user, service } = setup();
    await expect(service.update(admin.id, { role: Role.SALES }, admin)).rejects.toThrow(
      BadRequestException,
    );
    expect(user.update).not.toHaveBeenCalled();
  });

  it('update: admin boleh ganti nama sendiri & role user lain', async () => {
    const { user, service } = setup();
    await service.update(admin.id, { name: 'Admin Baru', role: Role.ADMIN }, admin);
    await service.update(existing.id, { role: Role.WAREHOUSE }, admin);
    expect(user.update).toHaveBeenCalledTimes(2);
    expect(user.update.mock.calls[1][0].data).toEqual({ role: Role.WAREHOUSE });
  });

  it('update 404', async () => {
    const { user, service } = setup();
    user.findUnique.mockResolvedValue(null);
    await expect(service.update('x', { name: 'X' }, admin)).rejects.toThrow(NotFoundException);
  });

  it('deactivate: tidak bisa menonaktifkan diri sendiri', async () => {
    const { user, refreshToken, service } = setup();
    await expect(service.deactivate(admin.id, admin)).rejects.toThrow(BadRequestException);
    expect(user.update).not.toHaveBeenCalled();
    expect(refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('deactivate: isActive=false + semua refresh token dicabut dalam satu transaksi', async () => {
    const { user, refreshToken, prisma, service } = setup();
    await service.deactivate(existing.id, admin);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(user.update.mock.calls[0][0]).toMatchObject({
      where: { id: existing.id },
      data: { isActive: false },
    });
    expect(refreshToken.updateMany.mock.calls[0][0]).toMatchObject({
      where: { userId: existing.id, revokedAt: null },
    });
  });

  it('activate: isActive=true', async () => {
    const { user, service } = setup();
    await service.activate(existing.id);
    expect(user.update.mock.calls[0][0].data).toEqual({ isActive: true });
  });

  it('resetPassword: hash baru + sesi lama dicabut', async () => {
    const { user, refreshToken, service } = setup();
    await service.resetPassword(existing.id, 'PasswordBaru1!');
    const { data } = user.update.mock.calls[0][0];
    expect(await bcrypt.compare('PasswordBaru1!', data.passwordHash)).toBe(true);
    expect(refreshToken.updateMany).toHaveBeenCalled();
  });
});
