import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service.js';
import { PurchaseBillsController } from './purchase-bills.controller.js';
import { SalesInvoicesController } from './sales-invoices.controller.js';

@Module({
  controllers: [SalesInvoicesController, PurchaseBillsController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicingModule {}
