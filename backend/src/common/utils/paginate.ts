import type { PaginatedResult, PaginationQueryDto } from '../dto/pagination.dto.js';

/** Hitung skip/take Prisma dari query. */
export function toSkipTake(query: Pick<PaginationQueryDto, 'page' | 'limit'>) {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}

/**
 * Bungkus hasil list ke format standar { data, meta }.
 * @example
 * const [rows, total] = await prisma.$transaction([
 *   prisma.product.findMany({ where, ...toSkipTake(q), orderBy }),
 *   prisma.product.count({ where }),
 * ]);
 * return paginate(rows, total, q);
 */
export function paginate<T>(
  data: T[],
  total: number,
  query: Pick<PaginationQueryDto, 'page' | 'limit'>,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

/** Whitelist kolom sort supaya user tidak bisa sort kolom sembarangan. */
export function toOrderBy<K extends string>(
  sortBy: string | undefined,
  allowed: readonly K[],
  fallback: K,
  sortOrder: 'asc' | 'desc',
): Record<K, 'asc' | 'desc'> {
  const key = (allowed as readonly string[]).includes(sortBy ?? '')
    ? (sortBy as K)
    : fallback;
  return { [key]: sortOrder } as Record<K, 'asc' | 'desc'>;
}
