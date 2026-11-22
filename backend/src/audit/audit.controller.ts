import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { AUDITED_ENTITIES } from './audit-targets.js';
import { AuditService } from './audit.service.js';
import { AuditQueryDto } from './dto/audit.dto.js';

/** Read-only: audit log tidak bisa diubah/dihapus lewat API. */
@ApiTags('audit-logs')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  findAll(@Query() query: AuditQueryDto) {
    return this.audit.findAll(query);
  }

  /** Daftar entity yang di-audit (untuk dropdown filter di FE). Sebelum `:id`. */
  @Get('entities')
  entities() {
    return AUDITED_ENTITIES;
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.audit.findOne(id);
  }
}
