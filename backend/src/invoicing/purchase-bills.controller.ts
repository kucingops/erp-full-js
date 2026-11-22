import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { InvoiceType, Role } from '../generated/prisma/enums.js';
import { InvoicesControllerBase } from './invoices.controller.base.js';
import { InvoicesService } from './invoices.service.js';

/** Tagihan supplier / hutang (AP). Baca & tulis: PURCHASING (ADMIN selalu lolos). */
@ApiTags('purchase-bills')
@ApiBearerAuth()
@Roles(Role.PURCHASING)
@Controller('purchase-bills')
export class PurchaseBillsController extends InvoicesControllerBase {
  protected readonly type = InvoiceType.PURCHASE;

  constructor(invoices: InvoicesService) {
    super(invoices);
  }
}
