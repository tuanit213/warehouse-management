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

## 3. Backup before deployment

If this is an upgrade of an existing stack, run:

```powershell
npm run prod:backup
```

See `docs/BACKUP_RESTORE.md` for restore instructions.

## 4. Start production stack

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 5. Verify deployment

```powershell
npm run health:check
npm run smoke:test
```

Expected checks:

- Frontend health endpoint returns HTTP 200.
- Gateway liveness is OK.
- Gateway readiness is OK.
- All downstream services return HTTP 200.
- Smoke test passes business flows and report exports.

## 6. Operational commands

View logs:

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=200
```

Stop stack:

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml down
```

Backup databases before destructive upgrades.

## 7. Production hardening notes

- Database and Redis ports are not published by `docker-compose.prod.yml`.
- Frontend and NestJS services run compiled production output in Docker, not dev/watch servers.
- Frontend exposes `/api/health` for container and load-balancer checks.
- API Gateway readiness endpoint validates downstream services.
- Use the Gateway `x-correlation-id` response header for incident tracing.
- Replace current SQL auto-init strategy with migrations before multi-node production.
- Add TLS/reverse proxy in front of Gateway and Frontend for internet exposure.
