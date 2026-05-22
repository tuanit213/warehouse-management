import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

function corsOptions() {
  const origins = (process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === 'production') {
    return { origin: origins.length ? origins : false, credentials: true };
  }
  return { origin: origins.length ? origins : ['http://localhost:3006', 'http://127.0.0.1:3006', 'http://localhost:3000'], credentials: true };
}

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && !process.env.INTERNAL_GATEWAY_TOKEN) {
    throw new Error('INTERNAL_GATEWAY_TOKEN is required in production');
  }
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: '6mb' }));
  app.use(urlencoded({ extended: true, limit: '6mb' }));
  app.setGlobalPrefix('api');
  app.enableCors(corsOptions());
  app.use((req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log('api-gateway listening on port', port);
}
bootstrap();
