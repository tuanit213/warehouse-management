import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import { PG_POOL } from './database';
import { ChangePasswordDto, LoginDto, RegisterDto, Role, UpdateRoleDto } from './dto';

type JwtPayload = { sub: string; email: string; role: Role; fullName: string };

@Injectable()
export class AuthService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly jwt: JwtService) {}

  private sanitize(row: any) {
    if (!row) return null;
    return { id: row.id, email: row.email, fullName: row.full_name, role: row.role, status: row.status, createdAt: row.created_at };
  }

  private async sign(user: any) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, fullName: user.full_name };
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
      [dto.email.trim().toLowerCase(), passwordHash, dto.fullName.trim(), role],
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
