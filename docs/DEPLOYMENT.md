# Production Deployment Runbook

## 1. Prepare environment

```powershell
Copy-Item .env.production.example .env.production
```

Edit `.env.production` and replace every placeholder secret/password.
Use long random values. Do not reuse development defaults.

Required production variables:

- `NODE_ENV=production`
- `JWT_SECRET` with at least 32 characters
- `POSTGRES_PASSWORD` with at least 12 characters
- `RABBITMQ_DEFAULT_PASS` with at least 12 characters

## 2. Validate configuration

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml config
```

Optional local env validation:

```powershell
$env:NODE_ENV='production'
$env:JWT_SECRET='replace-with-real-32-char-secret-value'
$env:POSTGRES_PASSWORD='replace-with-real-db-password'
$env:RABBITMQ_DEFAULT_PASS='replace-with-real-rabbit-password'
npm run prod:env:check
```

## 3. Start production stack

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 4. Verify deployment

```powershell
npm run health:check
npm run smoke:test
```

Expected checks:

- Gateway liveness is OK.
- Gateway readiness is OK.
- All downstream services return HTTP 200.
- Smoke test passes business flows and report exports.

## 5. Operational commands

View logs:

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=200
```

Stop stack:

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml down
```

Backup database volumes before destructive upgrades.

## 6. Production hardening notes

- Database and Redis ports are not published by `docker-compose.prod.yml`.
- API Gateway readiness endpoint validates downstream services.
- Use the Gateway `x-correlation-id` response header for incident tracing.
- Replace current SQL auto-init strategy with migrations before multi-node production.
- Add TLS/reverse proxy in front of Gateway and Frontend for internet exposure.
