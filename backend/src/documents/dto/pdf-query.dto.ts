import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class PdfQueryDto {
  @ApiPropertyOptional({
    description:
      '1/true = attachment (unduh), default inline (buka di tab browser)',
    example: 1,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '1' || value === 'true'
      ? true
      : value === '0' || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  download?: boolean;
}
