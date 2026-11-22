import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import type { InvoiceType } from '../generated/prisma/enums.js';
import {
  CandidateQueryDto,
  CreateInvoiceDto,
  CreatePaymentDto,
  InvoiceQueryDto,
} from './dto/invoice.dto.js';
import type { InvoicesService } from './invoices.service.js';

/**
 * Template method / inheritance: semua route ada di sini, subclass cukup isi `type`,
 * `@Controller(path)` dan `@Roles(...)` di level class (RolesGuard membaca metadata
 * class milik subclass). Di Java mirip `abstract class BaseInvoiceController`.
 */
export abstract class InvoicesControllerBase {
  protected abstract readonly type: InvoiceType;

  constructor(protected readonly invoices: InvoicesService) {}

  @Get()
  findAll(@Query() query: InvoiceQueryDto) {
    return this.invoices.findAll(this.type, query);
  }

  /** Ringkasan outstanding & aging. Didaftarkan sebelum `:id` supaya tidak dianggap id. */
  @Get('summary')
  summary() {
    return this.invoices.summary(this.type);
  }

  /** Order (SO SHIPPED / PO RECEIVED) yang belum ditagih. */
  @Get('candidates')
  candidates(@Query() query: CandidateQueryDto) {
    return this.invoices.candidates(this.type, query.search);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.findOne(this.type, id);
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoices.create(this.type, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.remove(this.type, id);
  }

  @Post(':id/payments')
  @HttpCode(200)
  addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.addPayment(this.type, id, dto, user);
  }

  @Delete(':id/payments/:paymentId')
  @HttpCode(200)
  removePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.invoices.removePayment(this.type, id, paymentId);
  }
}
