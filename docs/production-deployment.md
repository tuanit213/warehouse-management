# Production Deployment

## Required Environment

- `JWT_SECRET`: at least 32 characters, never `change-me-super-secret`.
- `INTERNAL_GATEWAY_TOKEN`: random secret shared by gateway and internal services.
- `CORS_ORIGIN`: public frontend origin.
- `POSTGRES_USER`: non-default production database role, not `postgres`; use a PostgreSQL-safe identifier with letters, numbers, and underscores, starting with a letter or underscore.
- `POSTGRES_PASSWORD`: production database password.
- `RABBITMQ_DEFAULT_USER` and `RABBITMQ_DEFAULT_PASS`: RabbitMQ credentials.
- `NEXT_PUBLIC_API_URL`: public gateway API URL.
- `PRODUCT_PUBLIC_BASE_URL`: public gateway API URL used for product upload URLs.
- `PUBLIC_FRONTEND_HOST` and `PUBLIC_API_HOST`: hostnames used by the bundled Caddy proxy when `-WithProxy` is enabled.
- `ACME_EMAIL`: optional Let's Encrypt notification email for Caddy.
- `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`: dedicated initial admin credentials. Do not reuse `POSTGRES_PASSWORD`.
- `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD`, or `SMOKE_ADMIN_ACCESS_TOKEN`: credentials used only by production smoke tests.

`CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`, and `PRODUCT_PUBLIC_BASE_URL` must be HTTPS public URLs for real production. They must not include embedded credentials, query strings, or hash fragments. The env validator rejects localhost/private hosts unless `ALLOW_LOCAL_PRODUCTION_URLS=true` is set for local production-like validation.
`POSTGRES_USER` is used as an unquoted PostgreSQL role identifier by the production maintenance scripts. Use only letters, numbers, and underscores, starting with a letter or underscore, up to 63 characters. `POSTGRES_PASSWORD`, `RABBITMQ_DEFAULT_USER`, and `RABBITMQ_DEFAULT_PASS` are embedded in connection URLs by Docker Compose. Use URL-safe unreserved characters only for those values: letters, numbers, dot, underscore, tilde, or hyphen. Avoid `@`, `:`, `/`, `#`, spaces, and query characters.
When using the bundled Caddy proxy, `PUBLIC_FRONTEND_HOST` must match the hostname in `CORS_ORIGIN`, `PUBLIC_API_HOST` must match the hostname in `NEXT_PUBLIC_API_URL`, and `ACME_EMAIL` must be valid. Proxy hosts are hostnames only, not full URLs.

## Pre-Deploy

The recommended path is to run `npm run prod:deploy`; it executes these preflight gates in order before touching the stack where possible. If running steps manually, keep the same order.

1. Validate production env:

```powershell
npm run prod:env:check
```

2. Validate compose config without printing resolved secrets:

```powershell
npm run prod:config
```

3. Run security audit:

```powershell
npm run security:audit
```

4. Run migration preflight:

```powershell
npm run prod:migrate:preflight
```

5. Back up databases:

```powershell
npm run prod:backup
```

## Deploy

Recommended:

```powershell
npm run prod:deploy
```

Dry-run before touching a server:

```powershell
npm run prod:deploy:dry-run
```

If a safety gate or image build must be skipped, approve it explicitly:

```powershell
npm run prod:deploy:dry-run -- -SkipBackup -ConfirmSkipGates
```

With observability:

```powershell
npm run prod:deploy -- -WithObservability
```

With bundled Caddy TLS reverse proxy:

```powershell
npm run prod:deploy -- -WithProxy
```

The npm production scripts use `scripts/run-powershell.js`, which selects `pwsh` on Linux/macOS or Windows PowerShell on Windows.

The deploy script derives `API_URL` from `NEXT_PUBLIC_API_URL` and `FRONTEND_URL` from `CORS_ORIGIN` for post-deploy verification. This keeps health and smoke checks pointed at the configured production URLs.
The frontend reads `NEXT_PUBLIC_API_URL` through its `/api/runtime-config` endpoint at container runtime, so changing the public API host does not require baking a separate frontend image.
When smoke is enabled, deploy preflight requires `SMOKE_ADMIN_EMAIL`/`SMOKE_ADMIN_PASSWORD` or `SMOKE_ADMIN_ACCESS_TOKEN` before migration, backup, or compose operations.
The deploy workflow also runs `npm run security:audit` before migration, backup, or compose deployment work.
Production migration preflight runs through Docker Compose against the running `auth-service-db`, `inventory-service-db`, and `transaction-service-db` services, so it does not require host-resolvable service DNS or database URLs with embedded passwords. For an approved first deploy with no existing data, use `-SkipMigratePreflight -ConfirmSkipGates`.
Post-deploy health checks are retried by default in `prod:deploy` with `HEALTH_CHECK_RETRIES=30` and `HEALTH_CHECK_RETRY_DELAY_MS=5000`, unless those env vars are already set.
Dry-run deploys still execute safe environment and compose validation, and compose validation is quiet to avoid printing resolved secrets.

Manual equivalent:

```powershell
npm run prod:env:check
npm run prod:config
npm run security:audit
npm run prod:migrate:preflight
npm run prod:backup
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --build
npm run prod:verify
```

The observability profile binds Prometheus, Grafana, and Loki host ports to `127.0.0.1` by default. Use SSH tunneling for remote access, or set `OBSERVABILITY_BIND_HOST=0.0.0.0` plus `OBSERVABILITY_EXPOSE_PUBLIC=true` only when firewall or reverse-proxy authentication is already in place.
Use `npm run prod:verify -- -WithProxy` when the bundled Caddy proxy is enabled, `npm run prod:verify -- -WithObservability` when the observability profile is enabled, or both switches when both profiles are active.
For manual deploys, set `HEALTH_CHECK_RETRIES` and `HEALTH_CHECK_RETRY_DELAY_MS` if the platform needs more warm-up time before `npm run health:check`.

For staging or production API URLs, `smoke:test` and live E2E checks require dedicated smoke/E2E credentials or an admin access token. They intentionally refuse demo or bootstrap password fallbacks on non-local hosts.
`prod:deploy` enforces the smoke credential preflight unless `-SkipSmoke` is used for an explicitly approved deployment.
Skipping security audit, backup, migration preflight, smoke, log scan, or image build requires `-ConfirmSkipGates` so copy/paste mistakes fail before deploy.
Real deploys from a dirty git worktree fail unless `-AllowDirtyWorktree` is explicitly approved; dry-runs only warn.

Only frontend and api-gateway should publish public ports in production.
When `docker-compose.proxy.yml` is enabled, only Caddy should publish `80/443`; frontend and api-gateway host ports are hidden by the proxy overlay.
The bundled Caddy proxy adds HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and removes the `Server` response header.
Services wait for RabbitMQ, Redis, and their PostgreSQL databases to become healthy before startup.

`prod:logs:check` scans the core WMS containers for fatal/error patterns in the recent log window. Tune it during incident response or remote checks with:

```powershell
$env:LOG_CHECK_SINCE="30m"
$env:LOG_CHECK_TAIL="1000"
$env:LOG_CHECK_MAX_RESTARTS="10"
npm run prod:logs:check
```

The same check fails if a core app container is missing, stopped, restarting, unhealthy, OOM-killed, or above the restart threshold. It also checks DB, Redis, and RabbitMQ container state by default through `LOG_CHECK_STATE_CONTAINERS`.
