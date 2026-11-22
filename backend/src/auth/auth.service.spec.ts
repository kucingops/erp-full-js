import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Role } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

/**
 * Unit test murni: PrismaService di-mock, tidak butuh database.
 * Pola ini (mock repository) sama dengan Mockito di Java.
 */
describe('AuthService', () => {
  const user = {
    id: 'u1',
    email: 'admin@erp.local',
    name: 'Admin',
    role: Role.ADMIN,
    isActive: true,
    passwordHash: bcrypt.hashSync('Admin123!', 4),
  };

  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    refreshToken: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let service: AuthService;
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '15m' } });
  const config = { get: vi.fn().mockReturnValue('7') } as unknown as ConfigService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: vi.fn() },
      refreshToken: {
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new AuthService(prisma as unknown as PrismaService, jwt, config);
  });

  describe('login', () => {
    it('mengembalikan token + user kalau kredensial benar', async () => {
      prisma.user.findUnique.mockResolvedValue(user);

      const res = await service.login(user.email, 'Admin123!');

      expect(res.user).toEqual({ id: 'u1', email: user.email, name: 'Admin', role: Role.ADMIN });
      const payload = await jwt.verifyAsync(res.accessToken);
      expect(payload).toMatchObject({ sub: 'u1', role: Role.ADMIN });
      expect(res.refreshToken).toHaveLength(96);
      // yang disimpan hash, bukan token aslinya
      const saved = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(saved.tokenHash).not.toBe(res.refreshToken);
    });

    it('menolak password salah', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(service.login(user.email, 'salah')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('menolak email tidak terdaftar', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login('x@y.z', 'Admin123!')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('menolak user nonaktif', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
      await expect(service.login(user.email, 'Admin123!')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    const future = new Date(Date.now() + 60_000);

    it('rotate token: token lama di-revoke, token baru diterbitkan', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 't1', userId: 'u1', revokedAt: null, expiresAt: future, user,
      });

      const res = await service.refresh('old-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' } }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledOnce();
      expect(res.refreshToken).not.toBe('old-token');
    });

    it('reuse detection: token yang sudah di-revoke mencabut semua sesi', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 't1', userId: 'u1', revokedAt: new Date(), expiresAt: future, user,
      });

      await expect(service.refresh('old-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
      );
    });

    it('menolak token kedaluwarsa', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 't1', userId: 'u1', revokedAt: null, expiresAt: new Date(0), user,
      });
      await expect(service.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('menolak token tidak dikenal', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
