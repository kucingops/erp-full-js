import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ToBoolean } from './boolean-query.js';
import { PaginationQueryDto } from './pagination.dto.js';

/** Query list master data: pagination standar + filter status aktif. */
export class ActiveFilterQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter status aktif' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
