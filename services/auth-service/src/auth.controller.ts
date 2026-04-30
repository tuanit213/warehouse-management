import { Body, Controller, Get, Headers, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateRoleDto } from './dto';

function bearer(auth?: string) {
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
  return auth.slice('Bearer '.length);
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Post('login')
  login(@Body() dto: LoginDto) { return this.auth.login(dto); }

  @Post('verify')
  verify(@Headers('authorization') authorization?: string) { return this.auth.verifyToken(bearer(authorization)); }

  @Get('me')
  me(@Headers('authorization') authorization?: string) { return this.auth.me(bearer(authorization)); }

  @Patch('change-password')
  changePassword(@Headers('authorization') authorization: string | undefined, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(bearer(authorization), dto);
  }

  @Get('users')
  async users(@Headers('authorization') authorization?: string) {
    const verified = await this.auth.verifyToken(bearer(authorization));
    return this.auth.listUsers(verified.user);
  }

  @Patch('users/:id/role')
  async updateRole(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const verified = await this.auth.verifyToken(bearer(authorization));
    return this.auth.updateRole(verified.user, id, dto);
  }
}
