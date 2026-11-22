import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { paginate, toOrderBy, toSkipTake } from '../common/utils/paginate.js';
import type {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/product.dto.js';

const SORTABLE = [
  'sku',
  'name',
  'unit',
  'costPrice',
  'salePrice',
  'minStock',
  'createdAt',
] as const;

const productInclude = {
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ProductQueryDto) {
    const where: Prisma.ProductWhereInput = {
      ...(query.search && {
        OR: [
          { sku: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: toOrderBy(
          query.sortBy,
          SORTABLE,
          'createdAt',
          query.sortOrder,
        ),
        ...toSkipTake(query),
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan');
    return product;
  }

  /** SKU duplikat → P2002 → 409, kategori tidak ada → P2003 → 409 (PrismaExceptionFilter). */
  create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto, include: productInclude });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: dto,
      include: productInclude,
    });
  }

  /**
   * Hapus permanen hanya kalau belum pernah dipakai (stok/PO/SO → FK Restrict → 409).
   * Produk yang sudah dipakai sebaiknya dinonaktifkan (isActive=false).
   */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
  }
}
