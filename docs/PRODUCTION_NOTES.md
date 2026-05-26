# Production Readiness Notes

## Current Baseline

- Docker images build production artifacts before runtime.
- Frontend runs the Next.js standalone output and exposes `/api/health`.
- Backend services run compiled `dist/main.js` output.
- API Gateway provides liveness and downstream readiness endpoints.
- `docker-compose.prod.yml` hides database and Redis ports from the host.
- Smoke tests cover login, refresh token rotation, CRUD reads, stock changes, transaction confirmation, voucher PDF export, report endpoints, and report export.
- Production env validation rejects weak defaults for core secrets.
- `npm audit --omit=dev --workspaces --include-workspace-root` has no backend-service production advisory after updating the Express transitive `qs` package to `6.15.2`. The frontend still reports the current Next.js transitive `postcss@8.4.31` advisory. The npm registry currently resolves latest stable Next.js to `16.2.6`, and `npm audit fix --force` proposes a breaking downgrade to Next 9. `npm run security:audit` tracks this exact advisory and fails if a new advisory appears or a newer stable Next.js version is available for review.

## Recommended Next Hardening

- Event-driven reporting: Report Service can consume Transaction events instead of relying only on direct reads.
- Audit log expansion: store actor, action, entity, before/after snapshots for user-facing write workflows.
- Logging: keep structured JSON logs and propagate correlation IDs from the Gateway.
- Monitoring: continue expanding Prometheus/Grafana alerts beyond health and container state.
- CI/CD: keep GitHub Actions build/test/push image gates required before deployment.
- Security: plan JWT rotation and rate limits for public auth endpoints.
- Deployment: evaluate Kubernetes or a managed container platform when independent scaling is required.

## Scale

- Backend services are stateless and can scale horizontally.
- Databases are separated by bounded context.
- Report/read models can be materialized later so dashboards do not need cross-service queries.

## 2026 Production Hardening Update

- `npm run prod:env:check` reads `.env.production` and rejects placeholders for JWT, internal gateway token, database password, RabbitMQ credentials, CORS origin, and frontend API URL. It also validates a PostgreSQL-safe `POSTGRES_USER` role name so deploy, backup/restore, and migration preflight gates use the same identifier rules. `npm run test:prod-migrate-preflight` covers the migration preflight's pre-Docker validation path for invalid role and database names, and `npm run test:prod-backup-restore` covers backup/restore validation before local artifacts or restore file checks.
- Auth Service can bootstrap the first admin from `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` on startup. The password is hashed immediately and is never logged; production compose requires a dedicated value and must not reuse the database password.
- Product image upload validates file type/size, stores files in the `product-upload-data` Docker volume mounted at `PRODUCT_UPLOAD_DIR`, and stores only URLs in PostgreSQL.
- Manual stock updates require a reason; inventory audit metadata includes gateway actor headers when available.
- Stock transfers use a dedicated `/stock-transfers` workflow, lock source and destination stock keys in a stable order, record paired transfer movements, and reject transfers that would make source stock negative.
- Inbound and outbound vouchers both support professional PDF export.
- Transaction Service writes durable `transaction_outbox_events` rows for created, confirmed, failed, and cancelled voucher events. A background publisher drains pending rows to the durable RabbitMQ topic exchange `wms.transaction.events`, uses confirm-channel publishing, retries with backoff, and keeps exhausted events in `FAILED` state while also attempting a dead-letter publish. The current MVP still updates Inventory synchronously for stock safety.
- Inventory Service subscribes to `transaction.confirmed` through RabbitMQ as an idempotent consumer. It uses transaction item IDs as stock movement reference IDs, so events published after the synchronous confirm path do not double-apply stock.
- Report exports return true `.xlsx` workbooks for inventory value, low stock, and stock movement reports. Warehouse/product filters are applied to table data and exported files.
- `npm run test:regression` includes static API contract checks, production env validation regression, production migration preflight pre-Docker validation regression, production backup/restore validation regression, and an E2E live smoke script. The live E2E script skips when `WMS_API_URL` or `API_URL` is not configured.

## 2026 Completion Update

- Admins can disable user accounts from the UI. Disabled accounts cannot verify tokens, and active refresh tokens are revoked during the status change.
- Product CSV import supports a dry-run preview. Preview does not create products or categories.
- Inventory stock reservations expose reserved and available quantities, prevent writes below reserved stock, and can be released or consumed by reference.
- Stocktake sessions can be counted and approved with audited adjustment movements using `referenceType=stocktake`.
- Optional observability is available with `docker-compose.observability.yml`: Prometheus scrapes gateway and service `/api/metrics`, Loki stores container logs, Promtail ships Docker logs with correlation-id labels when present, and Grafana provisions the WMS Overview dashboard plus Prometheus/Loki datasources.
- CI publishes versioned service images to GHCR after the main build/test/smoke job succeeds on `master`.
