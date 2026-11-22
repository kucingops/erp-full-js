import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

/**
 * Batasi endpoint ke role tertentu. ADMIN selalu lolos (lihat RolesGuard).
 * @example @Roles(Role.PURCHASING)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
