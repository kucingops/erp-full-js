import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { Role } from '../generated/prisma/enums.js';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';

/**
 * Baca: PURCHASING & WAREHOUSE. Buat/ubah/approve/cancel: PURCHASING. Terima barang: WAREHOUSE.
 * ADMIN selalu lolos (RolesGuard).
 */
@ApiTags('purchase-orders')
@ApiBearerAuth()
@Roles(Role.PURCHASING, Role.WAREHOUSE)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Get()
  findAll(@Query() query: PurchaseOrderQueryDto) {
    return this.orders.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(id);
  }

  @Post()
  @Roles(Role.PURCHASING)
  create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: AuthUser) {
    return this.orders.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.PURCHASING)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.orders.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.PURCHASING)
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.remove(id);
  }

  @Post(':id/approve')
  @Roles(Role.PURCHASING)
  @HttpCode(200)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.approve(id, user);
  }

  @Post(':id/receive')
  @Roles(Role.WAREHOUSE)
  @HttpCode(200)
  receive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.receive(id, user);
  }

  @Post(':id/cancel')
  @Roles(Role.PURCHASING)
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancel(id);
  }
}
