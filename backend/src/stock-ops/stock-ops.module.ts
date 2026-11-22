import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/index.js';
import { StockOpnamesController } from './stock-opnames.controller.js';
import { StockOpnamesService } from './stock-opnames.service.js';
import { StockTransfersController } from './stock-transfers.controller.js';
import { StockTransfersService } from './stock-transfers.service.js';

/**
 * Operasi gudang di atas InventoryService: transfer antar gudang + stock opname.
 * Satu modul supaya AppModule cukup tambah satu baris.
 */
@Module({
  imports: [InventoryModule],
  controllers: [StockTransfersController, StockOpnamesController],
  providers: [StockTransfersService, StockOpnamesService],
})
export class StockOpsModule {}
