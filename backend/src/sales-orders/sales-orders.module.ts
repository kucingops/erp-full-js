import { Module } from '@nestjs/common';
import { CurrenciesModule } from '../currencies/index.js';
import { InventoryModule } from '../inventory/index.js';
import { SalesOrdersController } from './sales-orders.controller.js';
import { SalesOrdersService } from './sales-orders.service.js';

@Module({
  imports: [InventoryModule, CurrenciesModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
})
export class SalesOrdersModule {}
