import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'crypto';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import { PG_POOL } from './database';
import { ChangePasswordDto, LoginDto, LogoutDto, RefreshTokenDto, RegisterDto, Role, UpdateRoleDto, UpdateUserStatusDto } from './dto';

type JwtPayload = { sub: string; email: string; role: Role; fullName: string };

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly jwt: JwtService) {}

  async onModuleInit() {
    await this.ensureSchema();
    await this.ensureBootstrapAdmin();
  }

  private async ensureSchema() {
    await this.db.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name VARCHAR(255),
        role VARCHAR(50) NOT NULL DEFAULT 'WAREHOUSE_STAFF',
        status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        token_hash TEXT NOT NULL,
        family_id UUID,
        replaced_by UUID NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        reuse_detected_at TIMESTAMPTZ NULL
      );
      CREATE TABLE IF NOT EXISTS auth_audit_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event VARCHAR(80) NOT NULL,
        user_id UUID NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id UUID;
      ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by UUID NULL;
      ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS reuse_detected_at TIMESTAMPTZ NULL;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role') THEN
          ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('ADMIN', 'MANAGER', 'WAREHOUSE_STAFF'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_status') THEN
          ALTER TABLE users ADD CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'DISABLED'));
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_expires ON refresh_tokens(user_id, expires_at DESC);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_replaced_by ON refresh_tokens(replaced_by);
      CREATE INDEX IF NOT EXISTS idx_auth_audit_events_event_created ON auth_audit_events(event, created_at DESC);
    `);
  }

  private sanitize(row: any) {
    if (!row) return null;
    return { id: row.id, email: row.email, fullName: row.full_name, role: row.role, status: row.status, createdAt: row.created_at };
  }

  private refreshDays() {
    const raw = Number(process.env.REFRESH_TOKEN_DAYS || 7);
    return Number.isFinite(raw) && raw > 0 ? raw : 7;
  }

  private log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ service: 'auth-service', level, event, timestamp: new Date().toISOString(), ...fields }));
  }

  private async audit(event: string, userId?: string | null, metadata: Record<string, unknown> = {}) {
    try {
      await this.db.query('INSERT INTO auth_audit_events(event, user_id, metadata) VALUES($1,$2,$3)', [event, userId || null, JSON.stringify(metadata)]);
    } catch {
      this.log('warn', 'audit_write_failed', { event });
    }
  }

  private async ensureBootstrapAdmin() {
    const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
    const fullName = (process.env.BOOTSTRAP_ADMIN_NAME || 'Bootstrap Admin').trim();
    if (!email && !password) return;
    if (!email || !password) {
      this.log('warn', 'bootstrap_admin_incomplete');
      return;
    }
    if (password.length < 12) {
      this.log('warn', 'bootstrap_admin_password_rejected', { email });
      return;
    }
    const existing = await this.db.query('SELECT id, role, status FROM users WHERE lower(email)=lower($1)', [email]);
    if (existing.rowCount) {
      const current = existing.rows[0];
      if (current.role !== 'ADMIN' || current.status !== 'ACTIVE') {
        await this.db.query('UPDATE users SET role=$1, status=$2 WHERE id=$3', ['ADMIN', 'ACTIVE', current.id]);
        await this.audit('bootstrap_admin_promoted', current.id, { email });
        this.log('info', 'bootstrap_admin_promoted', { email });
      }
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await this.db.query(
      'INSERT INTO users(email, password_hash, full_name, role, status) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [email, passwordHash, fullName, 'ADMIN', 'ACTIVE'],
    );
    await this.audit('bootstrap_admin_created', result.rows[0].id, { email });
    this.log('info', 'bootstrap_admin_created', { email });
  }

  private parseRefreshToken(refreshToken: string) {
    const [tokenId, secret, extra] = refreshToken.split('.');
    if (!tokenId || !secret || extra || secret.length < 32) throw new UnauthorizedException('Invalid or expired refresh token');
    return { tokenId, secret };
  }

  private async issueRefreshToken(userId: string, familyId: string = randomUUID()) {
    const tokenId = randomUUID();
    const secret = randomBytes(48).toString('base64url');
    const tokenHash = await bcrypt.hash(secret, 12);
    const expiresAt = new Date(Date.now() + this.refreshDays() * 24 * 60 * 60 * 1000);
    await this.db.query(
      'INSERT INTO refresh_tokens(id, user_id, token_hash, family_id, expires_at) VALUES($1,$2,$3,$4,$5)',
      [tokenId, userId, tokenHash, familyId, expiresAt],
    );
    return { tokenId, familyId, refreshToken: `${tokenId}.${secret}`, refreshExpiresAt: expiresAt.toISOString() };
  }

  private async buildTokenResponse(user: any, refresh: { refreshToken: string; refreshExpiresAt: string }) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, fullName: user.full_name };
    return {
      accessToken: await this.jwt.signAsync(payload),
      refreshToken: refresh.refreshToken,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      refreshExpiresAt: refresh.refreshExpiresAt,
      user: this.sanitize(user),
    };
  }

  private async sign(user: any, familyId?: string) {
    return this.buildTokenResponse(user, await this.issueRefreshToken(user.id, familyId));
  }

  async register(dto: RegisterDto) {
    const exists = await this.db.query('SELECT id FROM users WHERE lower(email)=lower($1)', [dto.email]);
    if (exists.rowCount) throw new ConflictException('Email already exists');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const role: Role = 'WAREHOUSE_STAFF';
    const result = await this.db.query(
      'INSERT INTO users(email, password_hash, full_name, role) VALUES($1,$2,$3,$4) RETURNING *',
      [dto.email.trim().toLowerCase(), passwordHash, dto.fullName.trim(), role],
    );
    return this.sign(result.rows[0]);
  }

  async login(dto: LoginDto) {
    const result = await this.db.query('SELECT * FROM users WHERE lower(email)=lower($1)', [dto.email]);
    const user = result.rows[0];
    if (!user) {
      this.log('warn', 'login_failed', { email: dto.email.trim().toLowerCase(), reason: 'invalid_credentials' });
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== 'ACTIVE') {
      this.log('warn', 'login_failed', { email: dto.email.trim().toLowerCase(), reason: 'inactive' });
      throw new ForbiddenException('Account is not active');
    }
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) {
      this.log('warn', 'login_failed', { email: dto.email.trim().toLowerCase(), reason: 'invalid_credentials' });
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.sign(user);
  }

  async refresh(dto: RefreshTokenDto) {
    const { tokenId, secret } = this.parseRefreshToken(dto.refreshToken);
    const result = await this.db.query(
      `SELECT rt.id AS refresh_token_id, rt.token_hash, rt.user_id, rt.family_id, rt.revoked_at, rt.expires_at, u.*
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.id=$1 AND u.status = 'ACTIVE'`,
      [tokenId],
    );
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(secret, row.token_hash))) {
      this.log('warn', 'refresh_failed', { reason: 'invalid_token' });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (row.revoked_at) {
      if (row.family_id) {
        await this.db.query(
          `UPDATE refresh_tokens
           SET revoked_at=COALESCE(revoked_at, NOW()),
               reuse_detected_at=COALESCE(reuse_detected_at, NOW())
           WHERE family_id=$1`,
          [row.family_id],
        );
      } else {
        await this.db.query('UPDATE refresh_tokens SET reuse_detected_at=COALESCE(reuse_detected_at, NOW()) WHERE id=$1', [row.refresh_token_id]);
      }
      this.log('warn', 'reuse_detected', { userId: row.user_id });
      await this.audit('refresh_reuse_detected', row.user_id, { familyId: row.family_id || null });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      this.log('warn', 'refresh_failed', { reason: 'expired', userId: row.user_id });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const familyId = row.family_id || randomUUID();
    const refresh = await this.issueRefreshToken(row.user_id, familyId);
    await this.db.query('UPDATE refresh_tokens SET revoked_at=NOW(), family_id=$2, replaced_by=$3 WHERE id=$1', [row.refresh_token_id, familyId, refresh.tokenId]);
    return this.buildTokenResponse(row, refresh);
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
      try {
        const { tokenId, secret } = this.parseRefreshToken(dto.refreshToken);
        const params: unknown[] = [tokenId];
        const scope = userId ? ' AND user_id=$2' : '';
        if (userId) params.push(userId);
        const result = await this.db.query(`SELECT id, token_hash FROM refresh_tokens WHERE id=$1 AND revoked_at IS NULL${scope}`, params);
        const row = result.rows[0];
        if (row && await bcrypt.compare(secret, row.token_hash)) {
          await this.db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1', [tokenId]);
          return { loggedOut: true };
        }
      } catch {
        return { loggedOut: true };
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
    this.log('info', 'role_changed', { actorId: currentUser.id, userId: id, role: dto.role });
    await this.audit('role_changed', id, { actorId: currentUser.id, role: dto.role });
    return this.sanitize(result.rows[0]);
  }

  async updateStatus(currentUser: any, id: string, dto: UpdateUserStatusDto) {
    if (currentUser.role !== 'ADMIN') throw new ForbiddenException('Admin role required');
    if (currentUser.id === id && dto.status === 'DISABLED') throw new ConflictException('Admin cannot disable own account');
    const result = await this.db.query('UPDATE users SET status=$1 WHERE id=$2 RETURNING *', [dto.status, id]);
    if (!result.rowCount) throw new NotFoundException('User not found');
    if (dto.status === 'DISABLED') await this.db.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
    this.log('info', 'user_status_changed', { actorId: currentUser.id, userId: id, status: dto.status });
    await this.audit('user_status_changed', id, { actorId: currentUser.id, status: dto.status });
    return this.sanitize(result.rows[0]);
  }
}
