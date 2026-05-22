# Production Readiness Notes

## Current baseline

- Docker images build production artifacts before runtime.
- Frontend runs Next.js standalone output and exposes `/api/health`.
- Backend services run compiled `dist/main.js` output.
- API Gateway provides liveness and downstream readiness endpoints.
- `docker-compose.prod.yml` hides database and Redis ports from the host.
- Smoke tests cover login, refresh token rotation, CRUD reads, stock changes, transaction confirmation, report endpoints and export.
- Production env validation rejects weak defaults for core secrets.
- `npm audit --omit=dev` is clean for backend service images after the Nest 11 upgrade. The frontend still reports the current Next.js transitive `postcss` advisory; npm registry currently resolves latest stable Next.js to `16.2.6`, so do not use `npm audit fix --force` because it proposes a breaking downgrade. Re-run audit after the next Next.js patch release.

## Recommended next hardening

- Event-driven bằng RabbitMQ: Inventory và Report consume event từ Transaction.
- Audit log: lưu actor, action, entity, before/after.
- Logging: JSON log, correlation id từ Gateway.
- Monitoring: Prometheus + Grafana, health endpoint từng service.
- CI/CD: GitHub Actions build/test/push image.
- Security: JWT rotation, refresh token revoke, rate limit, helmet, validation pipe.
- Deployment: tách compose dev/prod hoặc Kubernetes cho scale service độc lập.

## Scale

- Stateless backend service để scale horizontal.
- Database riêng theo bounded context.
- Read model/report snapshot để dashboard không query xuyên service.

## 2026 production hardening update

- `npm run prod:env:check` reads `.env.production` and rejects placeholders for JWT, internal gateway token, database password, RabbitMQ credentials, CORS origin, and frontend API URL.
- Auth Service can bootstrap the first admin from `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` on startup. The password is hashed immediately and is never logged; set a dedicated value in real production instead of relying on compose fallbacks.
- Product image upload validates file type/size, stores files in the `product-upload-data` Docker volume, and stores only URLs in PostgreSQL.
- Manual stock updates require a reason; inventory audit metadata includes gateway actor headers when available.
- Stock transfers use a dedicated `/stock-transfers` workflow, lock source and destination stock keys in a stable order, record paired transfer movements, and reject transfers that would make source stock negative.
- Inbound and outbound vouchers both support PDF export.
- Transaction Service writes durable `transaction_outbox_events` rows for created, confirmed, failed, and cancelled voucher events. A background publisher drains pending rows to the durable RabbitMQ topic exchange `wms.transaction.events`, uses confirm-channel publishing, retries with backoff, and keeps exhausted events in `FAILED` state while also attempting a dead-letter publish. The current MVP still updates Inventory synchronously for stock safety.
- Inventory Service subscribes to `transaction.confirmed` through RabbitMQ as an idempotent consumer. It uses transaction item ids as stock movement reference ids, so events published after the synchronous confirm path do not double-apply stock.
- Report exports return true `.xlsx` workbooks for inventory value, low stock, and stock movement reports. Warehouse/product filters are applied to table data and exported files.
- `npm run test:regression` includes static API contract checks and an E2E live smoke script. The live E2E script skips when `WMS_API_URL` or `API_URL` is not configured.

## 2026 completion update

- Admins can disable user accounts from the UI. Disabled accounts cannot verify tokens, and active refresh tokens are revoked during the status change.
- Product CSV import supports a dry-run preview. Preview does not create products or categories.
- Inventory stock reservations expose reserved and available quantities, prevent writes below reserved stock, and can be released or consumed by reference.
- Stocktake sessions can be counted and approved with audited adjustment movements using `referenceType=stocktake`.
- Optional observability is available with `docker-compose.observability.yml`: Prometheus scrapes gateway and service `/api/metrics`, Loki stores container logs, Promtail ships Docker logs with correlation-id labels when present, and Grafana provisions the WMS Overview dashboard plus Prometheus/Loki datasources.
- CI publishes versioned service images to GHCR after the main build/test/smoke job succeeds on `master`.
