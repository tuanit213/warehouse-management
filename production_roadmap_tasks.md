# Production Roadmap Tasks

This file is the current production task checklist for the warehouse management system. It is derived from `docs/ROADMAP.md`, `docs/PRODUCTION_NOTES.md`, and the current implemented services.

## MVP Scope

- [x] Auth service with JWT login, refresh rotation, logout, user listing, and role updates.
- [x] API Gateway routing with JWT verification, RBAC, request correlation id, rate limiting for auth endpoints, and downstream readiness.
- [x] Product and category CRUD with search, filter, and pagination.
- [x] Inventory warehouses, locations, stock levels, stock adjustments, low-stock alerts, aging alerts, stock movements, idempotency, and negative-stock protection.
- [x] Transaction service for inbound/outbound vouchers, suppliers, confirm/cancel flow, retry-safe confirmation, and inbound PDF export.
- [x] Report service dashboard, summary, inventory value, low stock, movement, in/out chart, CSV export, and PDF export.
- [x] Next.js admin frontend for the main warehouse workflows.
- [x] Docker Compose local stack and production override.
- [x] Seed, smoke, health, regression, critical, and migration scripts.
- [x] Database migrations with dry-run, preflight, and idempotency checks.
- [x] Production environment validation, backup, restore, deployment, rollback, and incident docs.

## Production Hardening

- [x] Backend services run compiled production artifacts.
- [x] Frontend uses Next.js standalone production output.
- [x] Backend service ports are hidden in production compose.
- [x] Health endpoints are available for gateway and downstream services.
- [x] Gateway exposes Prometheus text metrics at `/api/metrics`.
- [x] Backend services expose Prometheus text metrics at their internal `/api/metrics` endpoints.
- [x] Static quality check enforces Docker runtime mode, mojibake guard, and metrics endpoint coverage.
- [x] CI validates compose, quality checks, typechecks, migrations, frontend build, regressions, critical checks, workspace builds, stack readiness, and smoke tests.

## Verification Commands

Run these before marking a production milestone complete:

```powershell
npm run test:quality
npm run test:regression
npm run test:critical
npm run migrate:dry-run
npm run build --workspaces
```

Run these with the Docker stack active:

```powershell
npm run health:check
npm run smoke:test
```

## Deferred Enhancements

- [ ] Replace the current MVP synchronous transaction-to-inventory confirm path with a durable RabbitMQ consumer and outbox flow.
- [ ] Add a full Prometheus and Grafana deployment profile.
- [ ] Add centralized log shipping, for example Loki or ELK.
- [ ] Add image build and registry push stages when a production registry is selected.
- [ ] Add Kubernetes or another orchestrator when independent service scaling is required.
