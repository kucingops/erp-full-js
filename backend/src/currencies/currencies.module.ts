import { Module } from '@nestjs/common';
import { CurrenciesController, ExchangeRatesController } from './currencies.controller.js';
import { CurrenciesService } from './currencies.service.js';

@Module({
  controllers: [CurrenciesController, ExchangeRatesController],
  providers: [CurrenciesService],
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
