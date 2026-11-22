import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { MasterDataModule } from './master-data/master-data.module.js';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module.js';
import { SalesOrdersModule } from './sales-orders/sales-orders.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { InvoicingModule } from './invoicing/invoicing.module.js';
import { CurrenciesModule } from './currencies/index.js';
import { StockOpsModule } from './stock-ops/stock-ops.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    // Modul fitur baru: tambahkan di bawah ini (satu baris per modul).
    InventoryModule,
    DashboardModule,
    MasterDataModule,
    PurchaseOrdersModule,
    SalesOrdersModule,
    ReportsModule,
    InvoicingModule,
    CurrenciesModule,
    StockOpsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
