import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ToBoolean } from '../../common/dto/boolean-query.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { AccountType, JournalSourceType } from '../../generated/prisma/enums.js';

const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

// ---------- Akun ----------

export class CreateAccountDto {
  @ApiProperty({ example: '6100' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^[0-9A-Za-z.-]{1,20}$/, { message: 'Kode akun hanya angka/huruf/titik/strip, maks 20' })
  code: string;

  @ApiProperty({ example: 'Beban Listrik' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: AccountType })
  @IsEnum(AccountType)
  type: AccountType;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ default: true, description: 'false = akun header (tidak bisa dijurnal)' })
  @IsOptional()
  @IsBoolean()
  isPostable?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateAccountDto extends PartialType(CreateAccountDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AccountQueryDto extends OmitType(PaginationQueryDto, ['page', 'limit'] as const) {
  @ApiPropertyOptional({ enum: AccountType })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @ApiPropertyOptional({ description: 'Hanya akun yang bisa dijurnal' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  postable?: boolean;

  @ApiPropertyOptional({ description: 'Ikutkan akun nonaktif' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includeInactive?: boolean;
}

// ---------- Jurnal ----------

export class JournalLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ example: 100000, default: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debit: number = 0;

  @ApiProperty({ example: 0, default: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit: number = 0;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(255)
  description?: string | null;
}

export class CreateJournalEntryDto {
  @ApiProperty({ example: '2026-11-22' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 'Setoran modal awal' })
  @IsString()
  @MaxLength(255)
  description: string;

  @ApiProperty({ type: [JournalLineDto] })
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  @ArrayMinSize(2)
  lines: JournalLineDto[];
}

export class JournalQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: JournalSourceType })
  @IsOptional()
  @IsEnum(JournalSourceType)
  sourceType?: JournalSourceType;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Jurnal yang menyentuh akun ini' })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

// ---------- Laporan ----------

export class PeriodQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01', description: 'Kosong = sejak awal' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Kosong = hari ini' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class LedgerQueryDto extends PeriodQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  accountId: string;
}
