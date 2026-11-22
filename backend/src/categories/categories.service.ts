import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';

const SORTABLE = ['name', 'createdAt'] as const;

/** Sertakan jumlah produk per kategori, berguna di tabel FE. */
const categoryInclude = {
  _count: { select: { products: true } },
} satisfies Prisma.CategoryInclude;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto) {
    const where: Prisma.CategoryWhereInput = query.search
      ? { name: { contains: query.search, mode: 'insensitive' } }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        include: categoryInclude,
        orderBy: toOrderBy(query.sortBy, SORTABLE, 'name', query.sortOrder),
        ...toSkipTake(query),
      }),
      this.prisma.category.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: categoryInclude,
    });
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    return category;
  }

  create(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: dto, include: categoryInclude });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    return this.prisma.category.update({
      where: { id },
      data: dto,
      include: categoryInclude,
    });
  }

  /** Produk di kategori ini tidak ikut terhapus: category_id jadi NULL (onDelete: SetNull). */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.category.delete({ where: { id } });
  }
}
