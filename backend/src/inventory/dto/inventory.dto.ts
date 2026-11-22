import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { StockMovementType, StockReferenceType } from '../../generated/prisma/enums.js';

/** GET /api/inventory/stocks */
export class StockQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Hanya stok <= minStock produk' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  lowStock?: boolean;
}

/** GET /api/inventory/movements (kartu stok) */
export class MovementQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: StockMovementType })
  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @ApiPropertyOptional({ enum: StockReferenceType })
  @IsOptional()
  @IsEnum(StockReferenceType)
  referenceType?: StockReferenceType;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Inklusif sampai akhir hari' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;
}

/** POST /api/inventory/adjustments */
export class CreateAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ example: -2, description: 'Selisih: positif = tambah, negatif = kurangi' })
  @IsInt()
  @IsNotIn([0], { message: 'quantity tidak boleh 0' })
  quantity: number;

  @ApiProperty({ example: 'Stock opname: 2 pcs rusak' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note: string;
}
