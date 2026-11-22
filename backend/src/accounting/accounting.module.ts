import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service.js';
import { AccountsController, JournalEntriesController, LedgerController } from './accounting.controller.js';
import { JournalEntriesService } from './journal-entries.service.js';
import { JournalPostingService } from './journal-posting.service.js';
import { LedgerService } from './ledger.service.js';

/**
 * Akuntansi: COA, jurnal (otomatis + manual), buku besar, neraca saldo.
 * Tidak meng-import modul lain: data invoice/payment/stok dibaca langsung lewat Prisma
 * oleh JournalPostingService (read-only), jadi modul lain tidak berubah.
 */
@Module({
  controllers: [AccountsController, JournalEntriesController, LedgerController],
  providers: [AccountsService, JournalEntriesService, JournalPostingService, LedgerService],
  exports: [JournalPostingService],
})
export class AccountingModule {}
