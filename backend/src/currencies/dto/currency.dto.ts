import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ActiveFilterQueryDto } from '../../common/dto/master-query.dto.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/** Kode ISO 4217: 3 huruf besar. Dipakai juga oleh DTO PO/SO/customer/supplier. */
export const CURRENCY_CODE = /^[A-Z]{3}$/;

export class CreateCurrencyDto {
  @ApiProperty({ example: 'USD', description: 'Kode ISO 4217 (3 huruf)' })
  @Transform(upper)
  @IsString()
  @Matches(CURRENCY_CODE, { message: 'code harus 3 huruf (ISO 4217), misal USD' })
  code: string;

  @ApiProperty({ example: 'US Dollar' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ example: '$' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(5)
  symbol?: string;

  @ApiPropertyOptional({ example: 2, minimum: 0, maximum: 4 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  decimals?: number;
}

/** Kode tidak bisa diubah (dipakai sebagai FK di dokumen). */
export class UpdateCurrencyDto extends PartialType(OmitType(CreateCurrencyDto, ['code'] as const)) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CurrencyQueryDto extends ActiveFilterQueryDto {}

export class UpsertExchangeRateDto {
  @ApiProperty({ example: 'USD' })
  @Transform(upper)
  @Matches(CURRENCY_CODE, { message: 'currencyCode harus 3 huruf (ISO 4217)' })
  currencyCode: string;

  @ApiProperty({ example: '2026-11-22', description: 'Tanggal mulai berlaku (WIB)' })
  @IsDateString()
  effectiveDate: string;

  @ApiProperty({ example: 15850.5, description: 'Nilai 1 unit mata uang dalam IDR' })
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rate: number;
}

export class UpdateExchangeRateDto {
  @ApiProperty({ example: 15850.5 })
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rate: number;
}

export class ExchangeRateQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'USD' })
  @Transform(upper)
  @IsOptional()
  @Matches(CURRENCY_CODE)
  currencyCode?: string;
}

export class ConvertQueryDto {
  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'USD' })
  @Transform(upper)
  @Matches(CURRENCY_CODE)
  from: string;

  @ApiPropertyOptional({ example: 'IDR', description: 'Default base currency' })
  @Transform(upper)
  @IsOptional()
  @Matches(CURRENCY_CODE)
  to?: string;

  @ApiPropertyOptional({ example: '2026-11-22', description: 'Default hari ini' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
