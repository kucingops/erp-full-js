import { Module } from '@nestjs/common';
import { InventoryQueryService } from './inventory-query.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';

/**
 * Modul lain (purchase-order, sales-order) cukup `imports: [InventoryModule]`
 * lalu inject `InventoryService`.
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryQueryService],
  exports: [InventoryService],
})
export class InventoryModule {}
