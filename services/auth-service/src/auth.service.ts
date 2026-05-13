import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import { PG_POOL } from './database';
import { ChangePasswordDto, LoginDto, LogoutDto, RefreshTokenDto, RegisterDto, Role, UpdateRoleDto } from './dto';

type JwtPayload = { sub: string; email: string; role: Role; fullName: string };

@Injectable()
export class AuthService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly jwt: JwtService) {}

  private sanitize(row: any) {
    if (!row) return null;
    return { id: row.id, email: row.email, fullName: row.full_name, role: row.role, status: row.status, createdAt: row.created_at };
  }

  private refreshDays() {
    const raw = Number(process.env.REFRESH_TOKEN_DAYS || 7);
    return Number.isFinite(raw) && raw > 0 ? raw : 7;
  }

  private async issueRefreshToken(userId: string) {
    const refreshToken = randomBytes(48).toString('base64url');
    const tokenHash = await bcrypt.hash(refreshToken, 12);
    const expiresAt = new Date(Date.now() + this.refreshDays() * 24 * 60 * 60 * 1000);
    await this.db.query('INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1,$2,$3)', [userId, tokenHash, expiresAt]);
    return { refreshToken, refreshExpiresAt: expiresAt.toISOString() };
  }

  private async sign(user: any) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, fullName: user.full_name };
    const refresh = await this.issueRefreshToken(user.id);
    return {
      accessToken: await this.jwt.signAsync(payload),
      refreshToken: refresh.refreshToken,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
      refreshExpiresAt: refresh.refreshExpiresAt,
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

  async refresh(dto: RefreshTokenDto) {
    const result = await this.db.query(
      `SELECT rt.id, rt.token_hash, rt.user_id, u.*
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.revoked_at IS NULL AND rt.expires_at > NOW() AND u.status = 'ACTIVE'
       ORDER BY rt.expires_at DESC`,
    );
    for (const row of result.rows) {
      if (await bcrypt.compare(dto.refreshToken, row.token_hash)) {
        await this.db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1', [row.id]);
        return this.sign(row);
      }
    }
    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  async logout(token: string | undefined, dto: LogoutDto) {
    let userId: string | undefined;
    if (token) {
      try {
        const verified = await this.verifyToken(token);
        userId = verified.user.id;
      } catch {
        userId = undefined;
      }
    }

    if (dto.refreshToken) {
      const params: unknown[] = [];
      const scope = userId ? ' AND user_id=$1' : '';
      if (userId) params.push(userId);
      const result = await this.db.query(`SELECT id, token_hash FROM refresh_tokens WHERE revoked_at IS NULL${scope}`, params);
      for (const row of result.rows) {
        if (await bcrypt.compare(dto.refreshToken, row.token_hash)) {
          await this.db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1', [row.id]);
          return { loggedOut: true };
        }
      }
    }

    if (userId) await this.db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
    return { loggedOut: true };
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
    await this.db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [user.id]);
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
    await this.db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
    return this.sanitize(result.rows[0]);
  }
}
