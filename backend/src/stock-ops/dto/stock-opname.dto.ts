import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { StockOpnameStatus } from '../../generated/prisma/enums.js';

/**
 * Cakupan lembar hitung: kosong = semua produk aktif, `productIds` = produk tertentu,
 * `categoryId` = satu kategori. Kalau dua-duanya dikirim, dipakai irisannya.
 */
export class CreateStockOpnameDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  productIds?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class StockOpnameCountDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 12, nullable: true, description: 'Hasil hitung fisik; null = kosongkan lagi' })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  countedQty: number | null;
}

/** Isi lembar hitung (hanya DRAFT). Baris yang tidak dikirim tidak berubah. */
export class UpdateStockOpnameDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ type: [StockOpnameCountDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockOpnameCountDto)
  lines?: StockOpnameCountDto[];
}

export class StockOpnameQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: StockOpnameStatus })
  @IsOptional()
  @IsEnum(StockOpnameStatus)
  status?: StockOpnameStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
