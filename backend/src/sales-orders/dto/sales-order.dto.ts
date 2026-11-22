import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsPositive,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CURRENCY_CODE } from '../../currencies/index.js';
import { SalesOrderStatus } from '../../generated/prisma/enums.js';

export class SalesOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 10, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 15000, description: 'Harga jual per unit' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;
}

export class CreateSalesOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId: string;

  @ApiProperty({ format: 'uuid', description: 'Gudang asal barang keluar' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({ example: '2026-11-22' })
  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'Mata uang dokumen (ISO 4217). Default: mata uang customer, lalu IDR.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @Matches(CURRENCY_CODE, { message: 'currencyCode harus 3 huruf (ISO 4217)' })
  currencyCode?: string;

  @ApiPropertyOptional({
    example: 15850.5,
    description: 'Kurs manual (1 unit mata uang = x IDR). Kosong = ambil dari tabel kurs per orderDate.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  exchangeRate?: number;

  @ApiProperty({ type: [SalesOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items: SalesOrderItemDto[];
}

/** Edit hanya boleh saat DRAFT. Kalau `items` dikirim, semua item lama diganti. */
export class UpdateSalesOrderDto extends PartialType(CreateSalesOrderDto) {}

export class SalesOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SalesOrderStatus })
  @IsOptional()
  @IsEnum(SalesOrderStatus)
  status?: SalesOrderStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
