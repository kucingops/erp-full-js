import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { ProductsModule } from '../products/products.module.js';
import { SuppliersModule } from '../suppliers/suppliers.module.js';
import { WarehousesModule } from '../warehouses/warehouses.module.js';

/**
 * Pengelompokan modul master data supaya cukup satu baris di AppModule
 * (mengurangi konflik merge dengan modul lain yang dikerjakan paralel).
 */
@Module({
  imports: [
    CategoriesModule,
    ProductsModule,
    CustomersModule,
    SuppliersModule,
    WarehousesModule,
  ],
})
export class MasterDataModule {}
