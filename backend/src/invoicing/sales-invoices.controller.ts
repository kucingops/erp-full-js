import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { InvoiceType, Role } from '../generated/prisma/enums.js';
import { InvoicesControllerBase } from './invoices.controller.base.js';
import { InvoicesService } from './invoices.service.js';

/** Invoice penjualan / piutang (AR). Baca & tulis: SALES (ADMIN selalu lolos). */
@ApiTags('sales-invoices')
@ApiBearerAuth()
@Roles(Role.SALES)
@Controller('sales-invoices')
export class SalesInvoicesController extends InvoicesControllerBase {
  protected readonly type = InvoiceType.SALES;

  constructor(invoices: InvoicesService) {
    super(invoices);
  }
}
