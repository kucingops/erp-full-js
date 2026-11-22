import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from '../common/types/auth-user.js';
import type { AuthUserResponse, TokenResponse } from './dto/auth.dto.js';

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/**
 * Strategi token:
 * - Access token: JWT pendek (default 15 menit), stateless.
 * - Refresh token: string acak, disimpan sebagai SHA-256 hash di DB, di-rotate tiap dipakai.
 *   Kalau token yang sudah di-revoke dipakai lagi (indikasi dicuri), semua sesi user dicabut.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<TokenResponse> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Pesan sama untuk email salah / password salah supaya tidak bocor info akun.
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email atau password salah');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Email atau password salah');

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!stored) throw new UnauthorizedException('Refresh token tidak valid');

    if (stored.revokedAt) {
      // Reuse detection: cabut semua sesi user ini.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token sudah dipakai');
    }
    if (stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Sesi sudah berakhir, silakan login lagi');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(stored.user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<AuthUserResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private async issueTokens(user: AuthUserResponse): Promise<TokenResponse> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(48).toString('hex');
    const days = Number(this.config.get('JWT_REFRESH_EXPIRES_DAYS') ?? 7);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }
}
