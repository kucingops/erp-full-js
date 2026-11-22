import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ActiveFilterQueryDto } from '../../common/dto/master-query.dto.js';
import { Role } from '../../generated/prisma/enums.js';

const normalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

export class CreateUserDto {
  @ApiProperty({ example: 'budi@erp.local' })
  @normalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Budi' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'Rahasia123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;
}

/**
 * PATCH hanya untuk profil (nama, email, role).
 * Password & status punya endpoint sendiri (`/reset-password`, `/deactivate`, `/activate`)
 * supaya aksinya eksplisit dan tercatat jelas di audit log.
 */
export class UpdateUserDto extends PartialType(
  PickType(CreateUserDto, ['email', 'name', 'role'] as const),
) {}

export class ResetPasswordDto extends PickType(CreateUserDto, ['password'] as const) {}

/** List user: pagination + filter isActive + filter role. */
export class UserQueryDto extends ActiveFilterQueryDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
