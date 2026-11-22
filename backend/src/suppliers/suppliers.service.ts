import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActiveFilterQueryDto } from '../common/dto/master-query.dto.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type {
  CreateSupplierDto,
  UpdateSupplierDto,
} from './dto/supplier.dto.js';

const SORTABLE = ['code', 'name', 'email', 'createdAt'] as const;

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ActiveFilterQueryDto) {
    const where: Prisma.SupplierWhereInput = {
      ...(query.search && {
        OR: [
          { code: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
        ],
      }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: toOrderBy(
          query.sortBy,
          SORTABLE,
          'createdAt',
          query.sortOrder,
        ),
        ...toSkipTake(query),
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  async findOne(id: string) {
    const row = await this.prisma.supplier.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Supplier tidak ditemukan');
    return row;
  }

  /** Kode duplikat → P2002 → 409 (PrismaExceptionFilter). */
  create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  /** Sudah dipakai di transaksi → FK Restrict → 409. Pakai isActive=false sebagai gantinya. */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.supplier.delete({ where: { id } });
  }
}
