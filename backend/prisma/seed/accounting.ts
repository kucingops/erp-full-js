import { Prisma, type PrismaClient } from '../../src/generated/prisma/client.js';
import { AccountType, JournalSourceType } from '../../src/generated/prisma/enums.js';
import { ACC } from '../../src/accounting/chart-of-accounts.js';
import { ensureSystemAccounts } from '../../src/accounting/system-accounts.js';

/**
 * COA standar + beberapa akun beban operasional contoh + jurnal modal awal.
 * Idempotent: akun pakai upsert, jurnal modal awal pakai sourceKey unik `SEED:OPENING`.
 * Jurnal otomatis dari invoice/payment/stok TIDAK dibuat di sini: dibuat oleh
 * JournalPostingService saat app jalan.
 */
export async function seedAccounting(prisma: PrismaClient) {
  const ids = await ensureSystemAccounts(prisma);

  const opex = await prisma.account.upsert({
    where: { code: '6000' },
    create: { code: '6000', name: 'Beban Operasional', type: AccountType.EXPENSE, isPostable: false },
    update: {},
  });
  for (const [code, name] of [
    ['6100', 'Beban Gaji'],
    ['6200', 'Beban Listrik & Air'],
    ['6300', 'Beban Sewa'],
  ]) {
    await prisma.account.upsert({
      where: { code },
      create: { code, name, type: AccountType.EXPENSE, parentId: opex.id },
      update: {},
    });
  }

  const amount = new Prisma.Decimal(500_000_000);
  await prisma.journalEntry.upsert({
    where: { sourceKey: 'SEED:OPENING' },
    update: {},
    create: {
      number: 'JV-OPENING-0001',
      date: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)),
      description: 'Setoran modal awal (data contoh)',
      sourceType: JournalSourceType.MANUAL,
      sourceKey: 'SEED:OPENING',
      lines: {
        create: [
          { lineNo: 1, accountId: ids.get(ACC.BANK)!, debit: amount, credit: 0 },
          { lineNo: 2, accountId: ids.get(ACC.CAPITAL)!, debit: 0, credit: amount },
        ],
      },
    },
  });
}
