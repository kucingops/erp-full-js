import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActiveFilterQueryDto } from '../common/dto/master-query.dto.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type {
  CreateWarehouseDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto.js';

const SORTABLE = ['code', 'name', 'createdAt'] as const;

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ActiveFilterQueryDto) {
    const where: Prisma.WarehouseWhereInput = {
      ...(query.search && {
        OR: [
          { code: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
          { address: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.warehouse.findMany({
        where,
        orderBy: toOrderBy(query.sortBy, SORTABLE, 'code', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.warehouse.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  async findOne(id: string) {
    const row = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Gudang tidak ditemukan');
    return row;
  }

  create(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({ data: dto });
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    await this.findOne(id);
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  /** Gudang yang sudah punya stok/transaksi → FK Restrict → 409. */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.warehouse.delete({ where: { id } });
  }
}
