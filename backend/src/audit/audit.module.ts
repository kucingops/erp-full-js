import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController } from './audit.controller.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuditService } from './audit.service.js';

/**
 * Satu modul, satu baris di AppModule. Interceptor dipasang global lewat APP_INTERCEPTOR,
 * jadi modul lain tidak perlu diubah. `@Global` supaya AuditService bisa di-inject
 * di mana saja untuk log manual.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
