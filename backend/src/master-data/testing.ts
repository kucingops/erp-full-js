import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Mock delegate Prisma (findMany, count, ...) untuk unit test master data.
 * $transaction([a, b]) cukup di-resolve berurutan, mirip Mockito `when(...).thenReturn(...)`.
 */
export function mockDelegate() {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue({}),
  };
}

export type MockDelegate = ReturnType<typeof mockDelegate>;

export function mockPrisma<K extends string>(model: K) {
  const delegate = mockDelegate();
  const prisma = {
    [model]: delegate,
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { delegate, prisma: prisma as unknown as PrismaService };
}

/** Query default seperti hasil PaginationQueryDto setelah ValidationPipe. */
export const baseQuery = { page: 1, limit: 10, sortOrder: 'desc' as const };
