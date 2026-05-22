import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DatabaseModule } from './database';
import { HealthController } from './health.controller';

const DEFAULT_JWT_SECRET = 'change-me-super-secret';

function jwtSecret() {
  const secret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (secret === DEFAULT_JWT_SECRET) throw new Error('JWT_SECRET must be changed in production');
    if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  return secret;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as SignOptions['expiresIn'] },
    }),
  ],
  controllers: [AuthController, HealthController],
  providers: [AuthService],
})
export class AppModule {}
