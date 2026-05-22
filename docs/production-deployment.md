# Production Deployment

## Required Environment

- `JWT_SECRET`: at least 32 characters, never `change-me-super-secret`.
- `INTERNAL_GATEWAY_TOKEN`: random secret shared by gateway and internal services.
- `CORS_ORIGIN`: public frontend origin.
- `POSTGRES_PASSWORD`: production database password.
- `RABBITMQ_DEFAULT_USER` and `RABBITMQ_DEFAULT_PASS`: RabbitMQ credentials.
- `NEXT_PUBLIC_API_URL`: public gateway API URL.

## Pre-Deploy

1. Back up databases:

```powershell
npm run prod:backup
```

2. Validate compose config:

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml config
```

3. Run migration preflight:

```powershell
npm run migrate:preflight
```

## Deploy

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --build
npm run health:check
npm run smoke:test
```

Only frontend and api-gateway should publish public ports in production.
