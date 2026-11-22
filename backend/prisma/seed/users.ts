import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { Role } from '../../src/generated/prisma/enums.js';

/** Akun demo, satu per role. Password demo hanya untuk lokal. */
export const DEMO_USERS = [
  { email: 'admin@erp.local', name: 'Admin', role: Role.ADMIN, password: 'Admin123!' },
  { email: 'gudang@erp.local', name: 'Staff Gudang', role: Role.WAREHOUSE, password: 'Gudang123!' },
  { email: 'sales@erp.local', name: 'Staff Sales', role: Role.SALES, password: 'Sales123!' },
  { email: 'purchasing@erp.local', name: 'Staff Purchasing', role: Role.PURCHASING, password: 'Purchasing123!' },
];

export async function seedUsers(prisma: PrismaClient) {
  for (const { password, ...user } of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
  }
}
