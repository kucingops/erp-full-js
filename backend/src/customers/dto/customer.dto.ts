import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** String kosong dari form = kosongkan kolom (null). @IsOptional() melewatkan null. */
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class CreateCustomerDto {
  @ApiProperty({
    example: 'CUST-001',
    description: 'Kode unik, huruf besar/angka/-/_',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,30}$/, {
    message: 'code hanya boleh huruf, angka, - atau _ (2-30 karakter)',
  })
  code: string;

  @ApiProperty({ example: 'PT Maju Jaya' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 'kontak@contoh.co.id' })
  @Transform(emptyToNull)
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({ example: '021-5551234' })
  @Transform(emptyToNull)
  @IsOptional()
  @Matches(/^[0-9+()\-\s]{6,20}$/, { message: 'phone tidak valid' })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Jl. Sudirman No. 1, Jakarta' })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
