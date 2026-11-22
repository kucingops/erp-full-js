import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { SYSTEM_ACCOUNTS } from './chart-of-accounts.js';

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Pastikan semua akun sistem ada (idempotent). Dipakai seed dan posting service.
 * Akun yang sudah ada tidak diubah nama/parent-nya (user boleh rename), cuma ditandai `isSystem`.
 * @returns peta kode akun → id
 */
export async function ensureSystemAccounts(client: Client): Promise<Map<string, string>> {
  const existing = await client.account.findMany({
    where: { code: { in: SYSTEM_ACCOUNTS.map((a) => a.code) } },
    select: { id: true, code: true, isSystem: true },
  });
  const ids = new Map(existing.map((a) => [a.code, a.id]));
  if (existing.length === SYSTEM_ACCOUNTS.length && existing.every((a) => a.isSystem)) return ids;

  for (const def of SYSTEM_ACCOUNTS) {
    const parentId = def.parent ? ids.get(def.parent) : undefined;
    const acc = await client.account.upsert({
      where: { code: def.code },
      create: {
        code: def.code,
        name: def.name,
        type: def.type,
        isPostable: def.isPostable,
        isSystem: true,
        description: def.description,
        parentId,
      },
      update: { isSystem: true },
      select: { id: true },
    });
    ids.set(def.code, acc.id);
  }
  return ids;
}
