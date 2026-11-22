import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { Role } from '../generated/prisma/enums.js';
import { AccountsService } from './accounts.service.js';
import {
  AccountQueryDto,
  CreateAccountDto,
  CreateJournalEntryDto,
  JournalQueryDto,
  LedgerQueryDto,
  PeriodQueryDto,
  UpdateAccountDto,
} from './dto/accounting.dto.js';
import { JournalEntriesService } from './journal-entries.service.js';
import { JournalPostingService } from './journal-posting.service.js';
import { LedgerService } from './ledger.service.js';

/**
 * Semua endpoint akuntansi: ADMIN saja (belum ada role FINANCE, lihat docs/accounting.md).
 * `@Roles(Role.ADMIN)` di level class; ADMIN memang selalu lolos, tapi tanpa @Roles
 * semua user login bisa akses.
 */
@ApiTags('accounting')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  findAll(@Query() q: AccountQueryDto) {
    return this.accounts.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.accounts.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.remove(id);
  }
}

@ApiTags('accounting')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('journal-entries')
export class JournalEntriesController {
  constructor(
    private readonly journals: JournalEntriesService,
    private readonly posting: JournalPostingService,
  ) {}

  @Get()
  findAll(@Query() q: JournalQueryDto) {
    return this.journals.findAll(q);
  }

  /** Posting jurnal otomatis sekarang (biasanya jalan sendiri). Sebelum `:id`. */
  @Post('sync')
  @HttpCode(200)
  sync() {
    return this.posting.sync();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.journals.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateJournalEntryDto, @CurrentUser() user: AuthUser) {
    return this.journals.create(dto, user);
  }

  @Post(':id/reverse')
  @HttpCode(200)
  reverse(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.journals.reverse(id, user);
  }
}

@ApiTags('accounting')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('general-ledger')
  generalLedger(@Query() q: LedgerQueryDto) {
    return this.ledger.generalLedger(q);
  }

  @Get('trial-balance')
  trialBalance(@Query() q: PeriodQueryDto) {
    return this.ledger.trialBalance(q);
  }
}
