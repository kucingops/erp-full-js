import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/index.js';
import { SalesOrdersController } from './sales-orders.controller.js';
import { SalesOrdersService } from './sales-orders.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
})
export class SalesOrdersModule {}
