import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export const ROLES = ['ADMIN', 'WAREHOUSE_STAFF', 'MANAGER'] as const;
export type Role = typeof ROLES[number];

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  fullName!: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  oldPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class UpdateRoleDto {
  @IsIn(ROLES)
  role!: Role;
}
