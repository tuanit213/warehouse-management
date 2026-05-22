# Phase 5 - Observability & CI Runbook

## Health endpoints

- `GET /api/health`: API Gateway liveness.
- `GET /api/health/ready`: API Gateway readiness plus downstream checks.
- `GET /api/metrics`: API Gateway Prometheus text metrics.
- `GET /api/metrics` on each backend container: service uptime and memory metrics.

Readiness validates:

- auth-service
- product-service
- inventory-service
- transaction-service
- report-service

## Local checks

```powershell
npm run health:check
npm run test:regression
npm run smoke:test
```

`health:check` fails if any downstream service is not ready.
`smoke:test` verifies the full business flow and report exports.

## Prometheus and Grafana profile

Validate the optional monitoring stack:

```powershell
npm run observability:config
```

Start it with production compose:

```powershell
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.observability.yml --profile observability up -d prometheus grafana
```

- Prometheus: `http://localhost:9090` by default.
- Grafana: `http://localhost:3008` by default.
- Required secret: `GRAFANA_ADMIN_PASSWORD` in `.env.production`.
- Dashboard provisioning: `ops/grafana/dashboards/wms-overview.json`.
- Prometheus scrape config: `ops/prometheus/prometheus.yml`.
- Loki config: `ops/loki/local-config.yml` with 7 day retention.
- Promtail config: `ops/promtail/config.yml`; container JSON logs are labeled by compose service and parsed for `correlationId`, `level`, and `event` when services emit JSON logs.

## CI pipeline

GitHub Actions workflow: `.github/workflows/ci.yml`

Pipeline stages:

1. Install dependencies with npm workspaces.
2. Validate Docker Compose config.
3. Build all workspaces.
4. Start Docker stack.
5. Wait for Gateway readiness.
6. Run smoke test.
7. Dump Docker logs on failure.
8. Stop stack.

## Production notes

- Keep `/api/health` for load balancer liveness probes.
- Use `/api/health/ready` for readiness probes before accepting traffic.
- Scrape gateway metrics through the published gateway port. Scrape service metrics from the Docker network or a private monitoring network; production compose does not publish backend service ports.
- Preserve `x-correlation-id` from Gateway logs and client responses for request tracing.
- Centralized logging can ingest `docker compose logs` output initially; Loki/ELK can be added later without app API changes.
- With the observability profile, search logs in Grafana Explore through the `WMS Loki` datasource. Query by correlation id with `{correlationId="..."}` when the id is present in structured log output.
