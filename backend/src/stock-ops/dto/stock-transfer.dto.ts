import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { StockTransferStatus } from '../../generated/prisma/enums.js';

export class StockTransferItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 5, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateStockTransferDto {
  @ApiProperty({ format: 'uuid', description: 'Gudang asal (stok keluar saat send)' })
  @IsUUID()
  fromWarehouseId: string;

  @ApiProperty({ format: 'uuid', description: 'Gudang tujuan (stok masuk saat receive)' })
  @IsUUID()
  toWarehouseId: string;

  @ApiPropertyOptional({ example: '2026-11-23' })
  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [StockTransferItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items: StockTransferItemDto[];
}

/** Edit hanya saat DRAFT. Kalau `items` dikirim, semua item lama diganti. */
export class UpdateStockTransferDto extends PartialType(CreateStockTransferDto) {}

export class ReceiveStockTransferItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 4, minimum: 0, description: 'Qty diterima (0..qty kirim)' })
  @IsInt()
  @Min(0)
  receivedQuantity: number;
}

/** Body opsional. Item yang tidak disebut dianggap diterima penuh. */
export class ReceiveStockTransferDto {
  @ApiPropertyOptional({ type: [ReceiveStockTransferItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveStockTransferItemDto)
  items?: ReceiveStockTransferItemDto[];
}

export class StockTransferQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: StockTransferStatus })
  @IsOptional()
  @IsEnum(StockTransferStatus)
  status?: StockTransferStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Gudang asal ATAU tujuan' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
