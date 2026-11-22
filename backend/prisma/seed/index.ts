import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedUsers } from './users.js';
import { seedWarehouses } from './warehouses.js';
import { seedMasterData } from './master-data.js';

/**
 * Seed data demo. Tiap modul punya file sendiri di folder ini,
 * lalu dipanggil berurutan di sini (master data dulu, transaksi belakangan).
 * Semua seeder harus idempotent (pakai upsert) supaya aman dijalankan ulang.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  await seedUsers(prisma);
  await seedWarehouses(prisma);
  // Seeder modul lain: tambahkan di bawah ini.
  await seedMasterData(prisma);
}

main()
  .then(() => console.log('Seed selesai'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
