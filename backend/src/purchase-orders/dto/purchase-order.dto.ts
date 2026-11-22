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
import { PurchaseOrderStatus } from '../../generated/prisma/enums.js';

export class PurchaseOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 10, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 15000, description: 'Harga beli per unit' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId: string;

  @ApiProperty({ format: 'uuid', description: 'Gudang tujuan barang masuk' })
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
    description: 'Mata uang dokumen (ISO 4217). Default: mata uang supplier, lalu IDR.',
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

  @ApiProperty({ type: [PurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}

/** Edit hanya boleh saat DRAFT. Kalau `items` dikirim, semua item lama diganti. */
export class UpdatePurchaseOrderDto extends PartialType(CreatePurchaseOrderDto) {}

export class PurchaseOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PurchaseOrderStatus })
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}
