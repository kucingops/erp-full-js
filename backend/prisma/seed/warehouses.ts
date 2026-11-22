import type { PrismaClient } from '../../src/generated/prisma/client.js';

export async function seedWarehouses(prisma: PrismaClient) {
  const warehouses = [
    { code: 'WH-JKT', name: 'Gudang Jakarta', address: 'Jakarta' },
    { code: 'WH-BDG', name: 'Gudang Bandung', address: 'Bandung' },
  ];
  for (const w of warehouses) {
    await prisma.warehouse.upsert({ where: { code: w.code }, update: {}, create: w });
  }
}
