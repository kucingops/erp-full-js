import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccountQueryDto, CreateAccountDto, UpdateAccountDto } from './dto/accounting.dto.js';
import { ensureSystemAccounts } from './system-accounts.js';

/**
 * Bagan akun (COA). List TIDAK dipaginasi: COA biasanya puluhan baris dan ditampilkan
 * sebagai pohon urut kode, jadi FE butuh semuanya sekaligus.
 */
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(q: AccountQueryDto) {
    await ensureSystemAccounts(this.prisma);
    const where: Prisma.AccountWhereInput = {
      ...(q.type && { type: q.type }),
      ...(q.postable && { isPostable: true }),
      ...(!q.includeInactive && { isActive: true }),
      ...(q.search && {
        OR: [
          { code: { contains: q.search, mode: 'insensitive' } },
          { name: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
    return this.prisma.account.findMany({
      where,
      orderBy: { code: 'asc' },
      include: { parent: { select: { id: true, code: true, name: true } }, _count: { select: { lines: true } } },
    });
  }

  async findOne(id: string) {
    const acc = await this.prisma.account.findUnique({
      where: { id },
      include: { parent: { select: { id: true, code: true, name: true } }, _count: { select: { lines: true } } },
    });
    if (!acc) throw new NotFoundException('Akun tidak ditemukan');
    return acc;
  }

  async create(dto: CreateAccountDto) {
    if (dto.parentId) await this.assertParent(dto.parentId, dto.type);
    return this.prisma.account.create({
      data: {
        code: dto.code,
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId ?? null,
        isPostable: dto.isPostable ?? true,
        description: dto.description ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateAccountDto) {
    const acc = await this.findOne(id);
    const used = acc._count.lines > 0;
    if (acc.isSystem && (dto.type !== undefined && dto.type !== acc.type)) {
      throw new BadRequestException('Tipe akun sistem tidak boleh diubah');
    }
    if (acc.isSystem && (dto.isActive === false || dto.isPostable !== undefined && dto.isPostable !== acc.isPostable)) {
      throw new BadRequestException('Akun sistem dipakai jurnal otomatis: tidak boleh dinonaktifkan / diubah jenisnya');
    }
    if (used && dto.code !== undefined && dto.code !== acc.code) {
      throw new BadRequestException('Kode akun yang sudah dipakai jurnal tidak boleh diubah');
    }
    if (used && dto.type !== undefined && dto.type !== acc.type) {
      throw new BadRequestException('Tipe akun yang sudah dipakai jurnal tidak boleh diubah');
    }
    if (used && dto.isPostable === false) {
      throw new BadRequestException('Akun yang sudah dipakai jurnal tidak bisa dijadikan header');
    }
    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('Akun tidak bisa jadi induk dirinya sendiri');
      await this.assertParent(dto.parentId, dto.type ?? acc.type, id);
    }
    return this.prisma.account.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        type: dto.type,
        parentId: dto.parentId,
        isPostable: dto.isPostable,
        isActive: dto.isActive,
        description: dto.description,
      },
    });
  }

  async remove(id: string) {
    const acc = await this.findOne(id);
    if (acc.isSystem) throw new BadRequestException('Akun sistem tidak boleh dihapus');
    if (acc._count.lines > 0) {
      throw new ConflictException('Akun sudah dipakai jurnal, nonaktifkan saja');
    }
    // anak akun → FK Restrict → 409 lewat PrismaExceptionFilter
    await this.prisma.account.delete({ where: { id } });
  }

  /** Induk harus header, tipe sama, dan tidak membentuk siklus. */
  private async assertParent(parentId: string, type: string, selfId?: string) {
    let cursor: string | null = parentId;
    let first = true;
    while (cursor) {
      if (cursor === selfId) throw new BadRequestException('Induk akun membentuk siklus');
      const p: { id: string; type: string; isPostable: boolean; parentId: string | null } | null =
        await this.prisma.account.findUnique({
          where: { id: cursor },
          select: { id: true, type: true, isPostable: true, parentId: true },
        });
      if (!p) throw new NotFoundException('Akun induk tidak ditemukan');
      if (first) {
        if (p.isPostable) throw new BadRequestException('Akun induk harus akun header (tidak bisa dijurnal)');
        if (p.type !== type) throw new BadRequestException('Tipe akun harus sama dengan induknya');
        first = false;
      }
      cursor = p.parentId;
    }
  }
}
