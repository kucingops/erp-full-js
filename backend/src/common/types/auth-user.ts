import type { Role } from '../../generated/prisma/enums.js';

/** Isi payload JWT access token. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/** User yang ditempel ke request oleh JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
