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
  CreateSalesOrderDto,
  SalesOrderQueryDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto.js';
import { SalesOrdersService } from './sales-orders.service.js';

/**
 * Baca: SALES & WAREHOUSE. Buat/ubah/confirm/cancel: SALES. Kirim barang (ship): WAREHOUSE.
 * ADMIN selalu lolos (RolesGuard).
 */
@ApiTags('sales-orders')
@ApiBearerAuth()
@Roles(Role.SALES, Role.WAREHOUSE)
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly orders: SalesOrdersService) {}

  @Get()
  findAll(@Query() query: SalesOrderQueryDto) {
    return this.orders.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(id);
  }

  @Post()
  @Roles(Role.SALES)
  create(@Body() dto: CreateSalesOrderDto, @CurrentUser() user: AuthUser) {
    return this.orders.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.SALES)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSalesOrderDto) {
    return this.orders.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SALES)
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.remove(id);
  }

  @Post(':id/confirm')
  @Roles(Role.SALES)
  @HttpCode(200)
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.confirm(id);
  }

  @Post(':id/ship')
  @Roles(Role.WAREHOUSE)
  @HttpCode(200)
  ship(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.ship(id, user);
  }

  @Post(':id/cancel')
  @Roles(Role.SALES)
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancel(id);
  }
}
