import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { MasterDataModule } from './master-data/master-data.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module.js';
import { SalesOrdersModule } from './sales-orders/sales-orders.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    // Modul fitur baru: tambahkan di bawah ini (satu baris per modul).
    InventoryModule,
    PurchaseOrdersModule,
    SalesOrdersModule,
    MasterDataModule,
    DashboardModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
