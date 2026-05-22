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

function requireGatewayToken(req: any, res: any, next: () => void) {
  if (process.env.NODE_ENV !== 'production') return next();
  if (req.path === '/api/health' || req.path === '/api/health/ready') return next();
  const expected = process.env.INTERNAL_GATEWAY_TOKEN;
  if (!expected) return res.status(500).json({ message: 'INTERNAL_GATEWAY_TOKEN is not configured' });
  if (req.headers['x-internal-gateway-token'] !== expected) return res.status(403).json({ message: 'Internal gateway token required' });
  return next();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (process.env.NODE_ENV === 'production' && !process.env.INTERNAL_GATEWAY_TOKEN) throw new Error('INTERNAL_GATEWAY_TOKEN is required in production');
  app.use(requireGatewayToken);
  app.use(json({ limit: '6mb' }));
  app.use(urlencoded({ extended: true, limit: '6mb' }));
  app.setGlobalPrefix('api');
  app.enableCors(corsOptions());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log('product-service listening on port', port);
}
bootstrap();
