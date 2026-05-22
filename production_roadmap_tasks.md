# Production Roadmap Tasks

This file is the current production task checklist for the warehouse management system. It is derived from `docs/ROADMAP.md`, `docs/PRODUCTION_NOTES.md`, and the current implemented services.

## MVP Scope

- [x] Auth service with JWT login, refresh rotation, logout, user listing, and role updates.
- [x] API Gateway routing with JWT verification, RBAC, request correlation id, rate limiting for auth endpoints, and downstream readiness.
- [x] Product and category CRUD with search, filter, and pagination.
- [x] Inventory warehouses, locations, stock levels, stock adjustments, audited stock transfers, low-stock alerts, aging alerts, stock movements, idempotency, and negative-stock protection.
- [x] Transaction service for inbound/outbound vouchers, suppliers, confirm/cancel flow, retry-safe confirmation, and inbound/outbound PDF export.
- [x] Report service dashboard, summary, inventory value, low stock, movement, in/out chart, XLSX export, and PDF export.
- [x] Next.js admin frontend for the main warehouse workflows.
- [x] Docker Compose local stack and production override.
- [x] Seed, smoke, health, regression, critical, and migration scripts.
- [x] Database migrations with dry-run, preflight, and idempotency checks.
- [x] Production environment validation, backup, restore, deployment, rollback, and incident docs.
- [x] Product image upload uses a persistent production volume and stores URLs instead of base64 DB payloads.
- [x] Product catalog supports CSV import/export for bulk SKU maintenance.
- [x] Admin UI includes user role management, category management, password change, stock reason capture, and improved inventory SKU/name display.
- [x] Transaction service records durable outbox events and publishes them to RabbitMQ with retry/dead-letter handling.
- [x] Inventory service consumes `transaction.confirmed` events idempotently through RabbitMQ.
- [x] Stock transfer workflow moves inventory between warehouses or locations with RBAC, audit trail, smoke coverage, and source negative-stock protection.
- [x] Admin UI supports user enable/disable and backend revokes disabled-user refresh tokens.
- [x] Product CSV import has a dry-run preview that does not mutate products or categories.
- [x] Inventory supports stock reservations, available quantity protection, reference release/consume, and stocktake sessions with audited approval adjustments.

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

- [x] Add a RabbitMQ publisher worker for pending `transaction_outbox_events`; the current confirm path remains synchronous for MVP stock safety.
- [x] Add an idempotent Inventory RabbitMQ consumer for confirmed transaction events.
- [ ] Replace the compact MVP transaction form with a dedicated multi-row voucher editor page with preview/detail ergonomics beyond the current API support.
- [x] Add true `.xlsx` report generation for inventory, low-stock, and movement exports.
- [x] Add product CSV import/export for bulk catalog maintenance.
- [x] Add a full Prometheus and Grafana deployment profile.
- [x] Add centralized log shipping, for example Loki or ELK.
- [x] Add image build and registry push stages when a production registry is selected.
- [ ] Add Kubernetes or another orchestrator when independent service scaling is required.
