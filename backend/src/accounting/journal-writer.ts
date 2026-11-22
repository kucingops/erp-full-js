import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { JournalSourceType } from '../generated/prisma/enums.js';
import { docNumberPrefix, nextDocNumber } from '../common/utils/doc-number.js';
import { isBalanced } from './posting-rules.js';

type Tx = Prisma.TransactionClient;

/**
 * Kunci advisory Postgres untuk semua penulisan jurnal (nomor JV berurutan + sync tidak dobel).
 * Angka bebas asal konsisten; dipakai `pg_advisory_xact_lock` (lepas otomatis saat commit/rollback).
 */
export const JOURNAL_LOCK_KEY = 7_100_001;

export interface EntryInput {
  date: Date;
  description: string;
  sourceType: JournalSourceType;
  sourceId?: string | null;
  sourceNumber?: string | null;
  sourceKey?: string | null;
  reversalOfId?: string | null;
  createdById?: string | null;
  lines: { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal; description?: string | null }[];
}

/** Penomoran JV-YYYYMMDD-XXXX. Panggil di dalam transaksi yang sudah pegang JOURNAL_LOCK_KEY. */
export async function journalNumberer(tx: Tx, now = new Date()) {
  const prefix = docNumberPrefix('JV', now);
  const last = await tx.journalEntry.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  let current = last?.number ?? null;
  return () => (current = nextDocNumber(prefix, current));
}

/** Satu-satunya tempat INSERT jurnal: validasi balance di sini supaya tidak ada jurnal timpang. */
export function insertEntry(tx: Tx, number: string, e: EntryInput) {
  if (!isBalanced(e.lines)) {
    throw new BadRequestException('Jurnal tidak seimbang: total debit harus sama dengan total kredit');
  }
  return tx.journalEntry.create({
    data: {
      number,
      date: e.date,
      description: e.description,
      sourceType: e.sourceType,
      sourceId: e.sourceId ?? null,
      sourceNumber: e.sourceNumber ?? null,
      sourceKey: e.sourceKey ?? null,
      reversalOfId: e.reversalOfId ?? null,
      createdById: e.createdById ?? null,
      lines: {
        create: e.lines.map((l, i) => ({
          lineNo: i + 1,
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description ?? null,
        })),
      },
    },
    include: { lines: true },
  });
}
