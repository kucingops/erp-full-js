import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';

/**
 * Modul lain (purchase-order, sales-order) cukup `imports: [InventoryModule]`
 * lalu inject `InventoryService`.
 */
@Module({
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
