import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { Role } from '../generated/prisma/enums.js';
import { DashboardService } from './dashboard.service.js';
import { LowStockQueryDto, TrendQueryDto } from './dto/dashboard.dto.js';

/**
 * Endpoint read-only untuk halaman dashboard.
 * summary & trend boleh semua role, tapi isinya disaring per role (lihat dashboardScope).
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user.role);
  }

  @Get('trend')
  trend(@CurrentUser() user: AuthUser, @Query() query: TrendQueryDto) {
    return this.dashboard.trend(user.role, query.months);
  }

  @Get('low-stock')
  @Roles(Role.WAREHOUSE, Role.SALES, Role.PURCHASING)
  lowStock(@Query() query: LowStockQueryDto) {
    return this.dashboard.lowStock(query.limit);
  }
}
