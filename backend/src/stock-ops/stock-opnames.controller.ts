import {
  Body,
  Controller,
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
  CreateStockOpnameDto,
  StockOpnameQueryDto,
  UpdateStockOpnameDto,
} from './dto/stock-opname.dto.js';
import { StockOpnamesService } from './stock-opnames.service.js';

/**
 * Baca & tulis: WAREHOUSE (ADMIN selalu lolos).
 * Tidak ada DELETE: opname yang tidak jadi cukup di-cancel supaya jejaknya tetap ada.
 */
@ApiTags('stock-opnames')
@ApiBearerAuth()
@Roles(Role.WAREHOUSE)
@Controller('stock-opnames')
export class StockOpnamesController {
  constructor(private readonly opnames: StockOpnamesService) {}

  @Get()
  findAll(@Query() query: StockOpnameQueryDto) {
    return this.opnames.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.opnames.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateStockOpnameDto, @CurrentUser() user: AuthUser) {
    return this.opnames.create(dto, user);
  }

  /** Isi lembar hitung (counted qty) / catatan. */
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStockOpnameDto) {
    return this.opnames.update(id, dto);
  }

  @Post(':id/post')
  @HttpCode(200)
  post(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.opnames.post(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.opnames.cancel(id);
  }
}
