const fs = require('fs');
const path = require('path');
const root = 'D:/ProjectCaNhan/warehouse-management-system';
function mkdir(p){ fs.mkdirSync(p,{recursive:true}); }
function write(p,s){ mkdir(path.dirname(p)); fs.writeFileSync(p, s.replace(/\n/g,'\r\n'), 'utf8'); }
function patchJson(file, fn){ const p=path.join(root,file); const j=JSON.parse(fs.readFileSync(p,'utf8')); fn(j); fs.writeFileSync(p, JSON.stringify(j,null,2).replace(/\n/g,'\r\n'), 'utf8'); }
for (const svc of ['auth-service','api-gateway']) {
  patchJson(`services/${svc}/package.json`, j => {
    j.dependencies.bcryptjs = '^2.4.3';
    j.devDependencies['@types/pg'] = '^8.11.10';
    j.devDependencies['@types/bcryptjs'] = '^2.4.6';
  });
}
// Auth service
write(`${root}/services/auth-service/src/database.ts`, `import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
`);
write(`${root}/services/auth-service/src/dto.ts`, `import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

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
`);
write(`${root}/services/auth-service/src/auth.service.ts`, `import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import { PG_POOL } from './database';
import { ChangePasswordDto, LoginDto, RegisterDto, Role, UpdateRoleDto } from './dto';

type JwtPayload = { sub: string; email: string; role: Role };

@Injectable()
export class AuthService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly jwt: JwtService) {}

  private sanitize(row: any) {
    if (!row) return null;
    return { id: row.id, email: row.email, fullName: row.full_name, role: row.role, status: row.status, createdAt: row.created_at };
  }

  private async sign(user: any) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
      user: this.sanitize(user),
    };
  }

  async register(dto: RegisterDto) {
    const exists = await this.db.query('SELECT id FROM users WHERE lower(email)=lower($1)', [dto.email]);
    if (exists.rowCount) throw new ConflictException('Email already exists');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const role = dto.role || 'WAREHOUSE_STAFF';
    const result = await this.db.query(
      'INSERT INTO users(email, password_hash, full_name, role) VALUES($1,$2,$3,$4) RETURNING *',
      [dto.email, passwordHash, dto.fullName, role],
    );
    return this.sign(result.rows[0]);
  }

  async login(dto: LoginDto) {
    const result = await this.db.query('SELECT * FROM users WHERE lower(email)=lower($1)', [dto.email]);
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is not active');
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.sign(user);
  }

  async verifyToken(token: string) {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const result = await this.db.query('SELECT * FROM users WHERE id=$1 AND status=$2', [payload.sub, 'ACTIVE']);
      const user = result.rows[0];
      if (!user) throw new UnauthorizedException('User not found or inactive');
      return { valid: true, user: this.sanitize(user), claims: payload };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async me(token: string) {
    const verified = await this.verifyToken(token);
    return verified.user;
  }

  async changePassword(token: string, dto: ChangePasswordDto) {
    const verified = await this.verifyToken(token);
    const result = await this.db.query('SELECT * FROM users WHERE id=$1', [verified.user.id]);
    const user = result.rows[0];
    const ok = await bcrypt.compare(dto.oldPassword, user.password_hash);
    if (!ok) throw new UnauthorizedException('Old password is incorrect');
    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, user.id]);
    return { changed: true };
  }

  async listUsers(currentUser: any) {
    if (currentUser.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    const result = await this.db.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 100');
    return result.rows.map((row) => this.sanitize(row));
  }

  async updateRole(currentUser: any, id: string, dto: UpdateRoleDto) {
    if (currentUser.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    const result = await this.db.query('UPDATE users SET role=$1 WHERE id=$2 RETURNING *', [dto.role, id]);
    if (!result.rowCount) throw new NotFoundException('User not found');
    return this.sanitize(result.rows[0]);
  }
}
`);
write(`${root}/services/auth-service/src/auth.controller.ts`, `import { Body, Controller, Get, Headers, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
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
`);
write(`${root}/services/auth-service/src/app.module.ts`, `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DatabaseModule } from './database';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-me-super-secret',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '1d' },
    }),
  ],
  controllers: [AuthController, HealthController],
  providers: [AuthService],
})
export class AppModule {}
`);
// Gateway
write(`${root}/services/api-gateway/src/gateway.controller.ts`, `import { All, Controller, Get, HttpException, Req, Res, UnauthorizedException } from '@nestjs/common';

const serviceMap: Record<string, string> = {
  auth: 'http://auth-service:3001/api',
  products: 'http://product-service:3002/api',
  product: 'http://product-service:3002/api',
  inventory: 'http://inventory-service:3003/api',
  transactions: 'http://transaction-service:3004/api',
  transaction: 'http://transaction-service:3004/api',
  reports: 'http://report-service:3005/api',
  report: 'http://report-service:3005/api',
};

const publicPaths = ['/auth/login', '/auth/register'];

@Controller()
export class GatewayController {
  @Get('gateway/routes')
  routes() { return serviceMap; }

  @Get('gateway/me')
  async me(@Req() req: any) { return this.verify(req); }

  @All('*')
  async proxy(@Req() req: any, @Res() res: any) {
    const original = req.originalUrl.replace(/^\/api/, '') || '/';
    const [, first] = original.split('/');
    const base = serviceMap[first];
    if (!base) throw new HttpException({ message: 'No route for service', path: original }, 404);

    if (!publicPaths.includes(original)) await this.verify(req);

    const targetUrl = base + original;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (['host', 'content-length'].includes(key.toLowerCase())) continue;
      if (Array.isArray(value)) headers[key] = value.join(',');
      else if (value) headers[key] = String(value);
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || 'application/json';
    res.status(response.status).type(contentType).send(text);
  }

  private async verify(req: any) {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    const response = await fetch('http://auth-service:3001/api/auth/verify', { headers: { authorization } });
    if (!response.ok) throw new UnauthorizedException('Invalid token');
    return response.json();
  }
}
`);
write(`${root}/services/api-gateway/src/app.module.ts`, `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GatewayController } from './gateway.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [GatewayController, HealthController],
})
export class AppModule {}
`);
write(`${root}/docs/AUTH_GATEWAY.md`, `# Auth Service + API Gateway

## Auth endpoints qua Gateway

- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- PATCH /api/auth/change-password
- GET /api/auth/users (ADMIN)
- PATCH /api/auth/users/:id/role (ADMIN)

## JWT claims

\`\`\`json
{ "sub": "user-id", "email": "admin@wms.local", "role": "ADMIN" }
\`\`\`

## Gateway rule

- /api/auth/register và /api/auth/login là public.
- Các route còn lại cần Bearer token.
- Gateway gọi Auth Service /api/auth/verify để xác thực token trước khi proxy.

## Test nhanh

\`\`\`powershell
$body = @{ email='admin@wms.local'; password='Password@123'; fullName='Admin'; role='ADMIN' } | ConvertTo-Json
$reg = Invoke-RestMethod http://localhost:3000/api/auth/register -Method Post -ContentType 'application/json' -Body $body
$token = $reg.accessToken
Invoke-RestMethod http://localhost:3000/api/auth/me -Headers @{ Authorization = "Bearer $token" }
\`\`\`
`);
console.log('Implemented Auth Service and API Gateway');
