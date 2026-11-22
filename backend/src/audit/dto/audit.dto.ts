import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { AuditAction } from '../../generated/prisma/enums.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/audit-logs?entity=product&action=UPDATE&userId=...&from=2026-11-01&to=2026-11-30 */
export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'product' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  entity?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Riwayat satu baris data' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'User pelaku' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Tanggal awal (WIB), inklusif' })
  @IsOptional()
  @Matches(DATE, { message: 'from harus format YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Tanggal akhir (WIB), inklusif' })
  @IsOptional()
  @Matches(DATE, { message: 'to harus format YYYY-MM-DD' })
  to?: string;
}
