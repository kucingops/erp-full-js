import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { CurrenciesService } from './currencies.service.js';
import {
  ConvertQueryDto,
  CreateCurrencyDto,
  CurrencyQueryDto,
  ExchangeRateQueryDto,
  UpdateCurrencyDto,
  UpdateExchangeRateDto,
  UpsertExchangeRateDto,
} from './dto/currency.dto.js';

/** Baca: semua role login (dipakai form PO/SO). Tulis: ADMIN saja. */
@ApiTags('currencies')
@ApiBearerAuth()
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly service: CurrenciesService) {}

  @Get()
  findAll(@Query() query: CurrencyQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiConflictResponse({ description: 'Kode sudah dipakai' })
  create(@Body() dto: CreateCurrencyDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCurrencyDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Masih dipakai di dokumen/partner' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}

/** Kurs harian. Baca + convert: semua role. Tulis: ADMIN. */
@ApiTags('exchange-rates')
@ApiBearerAuth()
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly service: CurrenciesService) {}

  @Get()
  findAll(@Query() query: ExchangeRateQueryDto) {
    return this.service.findRates(query);
  }

  /** GET /api/exchange-rates/convert?amount=100&from=USD&to=IDR&date=2026-11-22 */
  @Get('convert')
  convert(@Query() query: ConvertQueryDto) {
    return this.service.convert(query);
  }

  /** Upsert per (mata uang, tanggal). */
  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: UpsertExchangeRateDto) {
    return this.service.upsertRate(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExchangeRateDto) {
    return this.service.updateRate(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeRate(id);
  }
}
