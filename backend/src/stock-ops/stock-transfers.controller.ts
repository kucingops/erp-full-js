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
  CreateStockTransferDto,
  ReceiveStockTransferDto,
  StockTransferQueryDto,
  UpdateStockTransferDto,
} from './dto/stock-transfer.dto.js';
import { StockTransfersService } from './stock-transfers.service.js';

/** Baca & tulis: WAREHOUSE (ADMIN selalu lolos). */
@ApiTags('stock-transfers')
@ApiBearerAuth()
@Roles(Role.WAREHOUSE)
@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @Get()
  findAll(@Query() query: StockTransferQueryDto) {
    return this.transfers.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateStockTransferDto, @CurrentUser() user: AuthUser) {
    return this.transfers.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStockTransferDto) {
    return this.transfers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.remove(id);
  }

  @Post(':id/send')
  @HttpCode(200)
  send(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.transfers.send(id, user);
  }

  @Post(':id/receive')
  @HttpCode(200)
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveStockTransferDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.transfers.receive(id, dto ?? {}, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.transfers.cancel(id, user);
  }
}
