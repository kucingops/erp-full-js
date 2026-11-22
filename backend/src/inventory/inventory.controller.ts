import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { Role } from '../generated/prisma/enums.js';
import { CreateAdjustmentDto, MovementQueryDto, StockQueryDto } from './dto/inventory.dto.js';
import { InventoryQueryService } from './inventory-query.service.js';
import { InventoryService } from './inventory.service.js';

@ApiTags('inventory')
@ApiBearerAuth()
@Roles(Role.WAREHOUSE, Role.SALES, Role.PURCHASING)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly queries: InventoryQueryService,
  ) {}

  @Get('stocks')
  findStocks(@Query() query: StockQueryDto) {
    return this.queries.findStocks(query);
  }

  @Get('movements')
  findMovements(@Query() query: MovementQueryDto) {
    return this.queries.findMovements(query);
  }

  @Post('adjustments')
  @Roles(Role.WAREHOUSE)
  createAdjustment(@Body() dto: CreateAdjustmentDto, @CurrentUser() user: AuthUser) {
    return this.inventory.createAdjustment({ ...dto, createdById: user.id });
  }
}
