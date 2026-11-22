import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { Prisma } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto.js';

/** Kolom yang aman dikirim ke client (tanpa passwordHash). */
const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const SORTABLE = ['name', 'email', 'role', 'isActive', 'createdAt'] as const;
const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: UserQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: toOrderBy(query.sortBy, SORTABLE, 'createdAt', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    return user;
  }

  async create(dto: CreateUserDto) {
    const { password, ...rest } = dto;
    // Email duplikat → P2002 → 409 lewat PrismaExceptionFilter.
    return this.prisma.user.create({
      data: { ...rest, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
      select: userSelect,
    });
  }

  /** Edit profil. Admin tidak boleh menurunkan role akunnya sendiri (biar tidak terkunci). */
  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    await this.findOne(id);
    if (id === actor.id && dto.role && dto.role !== Role.ADMIN) {
      throw new BadRequestException('Tidak bisa menurunkan role akun sendiri');
    }
    return this.prisma.user.update({ where: { id }, data: dto, select: userSelect });
  }

  /**
   * Nonaktifkan user + cabut semua refresh token-nya dalam satu transaksi.
   * Login & refresh langsung ditolak; access token yang sudah terbit tetap jalan
   * sampai kedaluwarsa (maks. 15 menit, JWT stateless).
   */
  async deactivate(id: string, actor: AuthUser) {
    if (id === actor.id) {
      throw new BadRequestException('Tidak bisa menonaktifkan akun sendiri');
    }
    await this.findOne(id);
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { isActive: false },
        select: userSelect,
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return user;
  }

  async activate(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: userSelect,
    });
  }

  /** Admin set password baru. Semua sesi lama user dicabut supaya harus login ulang. */
  async resetPassword(id: string, password: string) {
    await this.findOne(id);
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash },
        select: userSelect,
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return user;
  }
}
