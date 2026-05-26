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
- `INTERNAL_GATEWAY_TOKEN` with at least 32 characters
- `POSTGRES_USER` set to a non-default production role, not `postgres`; use a PostgreSQL-safe identifier with letters, numbers, and underscores, starting with a letter or underscore
- `POSTGRES_PASSWORD` with at least 12 characters
- `RABBITMQ_DEFAULT_USER`
- `RABBITMQ_DEFAULT_PASS` with at least 12 characters
- `CORS_ORIGIN`
- `NEXT_PUBLIC_API_URL`
- `PRODUCT_UPLOAD_DIR`
- `PRODUCT_PUBLIC_BASE_URL`
- `PUBLIC_FRONTEND_HOST` and `PUBLIC_API_HOST` when using the bundled Caddy reverse proxy
- `ACME_EMAIL` for Caddy/Let's Encrypt certificate notifications
- `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` for the initial admin account
- `GRAFANA_ADMIN_PASSWORD` when the observability profile is enabled

`POSTGRES_USER` is used as an unquoted PostgreSQL role identifier by the production maintenance scripts. Use only letters, numbers, and underscores, starting with a letter or underscore, up to 63 characters. `POSTGRES_PASSWORD`, `RABBITMQ_DEFAULT_USER`, and `RABBITMQ_DEFAULT_PASS` are embedded in connection URLs by Docker Compose. Use URL-safe unreserved characters only for those values: letters, numbers, dot, underscore, tilde, or hyphen. Avoid `@`, `:`, `/`, `#`, spaces, and query characters.

## 2. Validate configuration

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml config --quiet
```

Validate the production env file:

```powershell
npm run prod:env:check
```

For real production, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`, and `PRODUCT_PUBLIC_BASE_URL` must be HTTPS public URLs, not localhost or private-network hosts. These public base URLs must not include embedded credentials, query strings, or hash fragments. For local production-like validation only, set:

```powershell
$env:ALLOW_LOCAL_PRODUCTION_URLS="true"
npm run prod:env:check
```

When the bundled Caddy proxy is used, `PUBLIC_FRONTEND_HOST` must match the hostname in `CORS_ORIGIN`, `PUBLIC_API_HOST` must match the hostname in `NEXT_PUBLIC_API_URL`, and `ACME_EMAIL` must be a valid email address. These proxy values are hostnames only, without `https://`, paths, or ports.

Validate the optional observability profile:

```powershell
npm run observability:config
```

## 3. Backup before deployment

If this is an upgrade of an existing stack, run:

```powershell
npm run prod:backup
```

See `docs/BACKUP_RESTORE.md` for restore instructions.

## 4. Start production stack

Recommended executable deployment workflow:

```powershell
npm run prod:deploy
```

Preview the workflow without changing the server:

```powershell
npm run prod:deploy:dry-run
```

Skipping deployment safety gates such as security audit, backup, migration preflight, smoke, log scan, or image build requires `-ConfirmSkipGates`:

```powershell
npm run prod:deploy:dry-run -- -SkipBackup -ConfirmSkipGates
```

Deploy with the optional observability profile:

```powershell
npm run prod:deploy -- -WithObservability
```

Deploy with the bundled Caddy TLS reverse proxy:

```powershell
npm run prod:deploy -- -WithProxy
```

Deploy with both proxy and observability:

```powershell
npm run prod:deploy -- -WithProxy -WithObservability
```

The npm production scripts use `scripts/run-powershell.js`, which selects `pwsh` on Linux/macOS or Windows PowerShell on Windows.

The script validates the env file and compose config, runs `npm run security:audit`, runs production migration preflight through Docker Compose, creates a backup, starts the stack, runs health/smoke checks, optionally checks observability, and scans recent core service logs.
Production migration preflight uses `docker compose exec` against the running `auth-service-db`, `inventory-service-db`, and `transaction-service-db` services. This avoids host-only database URLs and keeps database passwords out of command lines. For an approved first deploy with no existing data, use `-SkipMigratePreflight -ConfirmSkipGates`.
Deploy dry-runs still execute safe env and compose validation, but compose validation uses `config --quiet` so resolved secrets are not printed.
When smoke is enabled, it also preflights `SMOKE_ADMIN_EMAIL`/`SMOKE_ADMIN_PASSWORD` or `SMOKE_ADMIN_ACCESS_TOKEN` before migration, backup, or deploy work starts.
For post-deploy verification it derives `API_URL` from `NEXT_PUBLIC_API_URL` and `FRONTEND_URL` from `CORS_ORIGIN`, so health and smoke checks verify the configured production URLs rather than silently falling back to localhost.
The frontend also exposes `/api/runtime-config` and loads it before the client bundle, so `NEXT_PUBLIC_API_URL` is read from the running container environment. This lets the same built frontend image run behind different production/staging API hosts.
Post-deploy health checks are retried by default in `prod:deploy` with `HEALTH_CHECK_RETRIES=30` and `HEALTH_CHECK_RETRY_DELAY_MS=5000`, unless those env vars are already set.

Manual equivalent:

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Start with Prometheus, Grafana, Loki, and Promtail:

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.observability.yml --profile observability up -d --build
```

Start with Caddy TLS reverse proxy:

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.proxy.yml --profile proxy up -d --build
```

## 5. Verify deployment

```powershell
npm run prod:verify
```

Use `npm run prod:verify -- -WithProxy` when the bundled Caddy proxy is enabled, `npm run prod:verify -- -WithObservability` when the observability profile is enabled, or both switches when both profiles are active.
For non-local API URLs, `smoke:test` refuses demo/bootstrap password fallbacks. Set `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD`, or `SMOKE_ADMIN_ACCESS_TOKEN`, before running it against staging or production.
For manual deploys, set `HEALTH_CHECK_RETRIES` and `HEALTH_CHECK_RETRY_DELAY_MS` if the platform needs more warm-up time before `npm run health:check`.
`prod:deploy` applies the same requirement before touching the stack unless `-SkipSmoke` is passed.
Any `-SkipSecurityAudit`, `-SkipBackup`, `-SkipMigratePreflight`, `-SkipSmoke`, or `-SkipLogCheck` usage must include `-ConfirmSkipGates` after the skipped gate is approved.
Any `-NoBuild` usage must also include `-ConfirmSkipGates`. Real deploys from a dirty git worktree fail unless `-AllowDirtyWorktree` is explicitly approved; dry-runs only warn.

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

Automated serious-log scan:

```powershell
npm run prod:logs:check
```

The log scan also fails if a core app container is missing, stopped, restarting, unhealthy, OOM-killed, or above `LOG_CHECK_MAX_RESTARTS` restart count. It also checks DB, Redis, and RabbitMQ container state by default through `LOG_CHECK_STATE_CONTAINERS`. Tune the restart threshold only during incident response:

```powershell
$env:LOG_CHECK_MAX_RESTARTS="10"
```

Stop stack:

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml down
```

Backup databases before destructive upgrades.

## 7. Production hardening notes

- Database and Redis ports are not published by `docker-compose.prod.yml`.
- Backend service ports are not published by `docker-compose.prod.yml`; only frontend and gateway remain host-facing.
- When `docker-compose.proxy.yml` is enabled, frontend and gateway host ports are also hidden and only Caddy publishes `80/443`.
- The bundled Caddy proxy adds HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and removes the `Server` response header.
- Frontend and NestJS services run compiled production output in Docker, not dev/watch servers.
- Product images are stored in the `product-upload-data` Docker volume mounted at `PRODUCT_UPLOAD_DIR` and served through the gateway at `/api/uploads/products/:fileName`.
- Frontend exposes `/api/health` for container and load-balancer checks.
- API Gateway readiness endpoint validates downstream services.
- Services wait for RabbitMQ, Redis, and their PostgreSQL databases to become healthy before startup.
- Use the Gateway `x-correlation-id` response header for incident tracing.
- Replace current SQL auto-init strategy with migrations before multi-node production.
- Use `docker-compose.proxy.yml` for bundled Caddy TLS, or place an external reverse proxy/load balancer in front of Gateway and Frontend.
- Prometheus/Grafana/Loki are optional and should be protected by a private network or reverse proxy authentication when exposed outside localhost.
- The observability profile binds Prometheus/Grafana/Loki to `127.0.0.1` by default. Public binding requires `OBSERVABILITY_BIND_HOST=0.0.0.0` and `OBSERVABILITY_EXPOSE_PUBLIC=true`.
- CI publishes GHCR images on `master`; pin deployments to a commit SHA tag for repeatable releases.
