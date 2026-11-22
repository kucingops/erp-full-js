import { Module } from '@nestjs/common';
import { CurrenciesModule } from '../currencies/index.js';
import { InventoryModule } from '../inventory/index.js';
import { PurchaseOrdersController } from './purchase-orders.controller.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';

@Module({
  imports: [InventoryModule, CurrenciesModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
