import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * Terjemahkan error Prisma jadi HTTP status yang masuk akal,
 * supaya service tidak perlu try/catch untuk kasus umum.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'Data sudah ada (duplikat)'],
      P2003: [HttpStatus.CONFLICT, 'Data masih dipakai / relasi tidak valid'],
      P2025: [HttpStatus.NOT_FOUND, 'Data tidak ditemukan'],
    };
    const [statusCode, message] = map[exception.code] ?? [
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Database error',
    ];
    res.status(statusCode).json({
      statusCode,
      message,
      error: exception.code,
      meta: exception.meta,
    });
  }
}
