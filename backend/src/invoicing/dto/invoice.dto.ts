import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ToBoolean } from '../../common/dto/boolean-query.js';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CURRENCY_CODE } from '../../currencies/index.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { InvoiceStatus, PaymentMethod } from '../../generated/prisma/enums.js';

export class CreateInvoiceDto {
  @ApiProperty({ format: 'uuid', description: 'Id SO (invoice penjualan) atau PO (tagihan pembelian)' })
  @IsUUID()
  orderId: string;

  @ApiPropertyOptional({ example: '2026-11-22', description: 'Default hari ini' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ example: '2026-12-22', description: 'Kalau kosong = issueDate + termDays' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 30, default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  termDays?: number;

  @ApiPropertyOptional({
    example: 15850.5,
    description: 'Kurs manual (1 unit mata uang = x IDR). Kosong = kurs order asal. Diabaikan untuk IDR.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  exchangeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreatePaymentDto {
  @ApiProperty({ example: 500000, description: 'Maksimal sebesar sisa tagihan' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: '2026-11-22', description: 'Default sekarang' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.TRANSFER })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({
    example: 15850.5,
    description: 'Kurs saat bayar. Kosong = kurs invoice. Diabaikan untuk IDR.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  exchangeRate?: number;

  @ApiPropertyOptional({ example: 'TRF-BCA-00123' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class InvoiceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'customerId (AR) / supplierId (AP)' })
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @Matches(CURRENCY_CODE, { message: 'currencyCode harus 3 huruf (ISO 4217)' })
  currencyCode?: string;

  @ApiPropertyOptional({ description: 'Hanya yang belum lunas (UNPAID + PARTIAL)' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  outstanding?: boolean;

  @ApiPropertyOptional({ description: 'Hanya yang lewat jatuh tempo & belum lunas' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  overdue?: boolean;
}

export class CandidateQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
