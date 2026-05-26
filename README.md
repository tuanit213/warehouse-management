# Warehouse Management System - Microservices

Hệ thống quản lý kho hàng cho doanh nghiệp vừa và nhỏ, thiết kế theo kiến trúc microservice và container hóa bằng Docker.

## Stack

- Frontend: Next.js + React + TypeScript
- Backend: NestJS + TypeScript
- Database: PostgreSQL riêng cho từng service
- Cache: Redis
- Message queue: RabbitMQ
- Container: Docker Compose
- Production readiness: health/readiness checks, smoke tests, GitHub Actions CI
- Docker runtime: production builds for Frontend and NestJS services
- Product images: local Docker volume via Product Service upload API; the DB stores stable image URLs, not base64 payloads.
- Product catalog: CSV import/export for bulk SKU maintenance.
- Inventory transfers: move stock between warehouses or bin locations with audit movements and negative-stock protection.
- Reports: dashboard filters and true `.xlsx` exports for inventory, low stock, and movements.
- Stock reservation and stocktake workflows are available through the Inventory API.
- Observability profile: Prometheus and Grafana are available through `docker-compose.observability.yml`.

## Services

- frontend: giao diện quản trị
- api-gateway: cổng API, xác thực JWT, route nội bộ
- auth-service: người dùng, đăng nhập, phân quyền
- product-service: sản phẩm, SKU, danh mục
- inventory-service: kho, vị trí, tồn kho, cảnh báo
- transaction-service: nhập/xuất kho, lịch sử, PDF, durable outbox rows
- report-service: dashboard, biểu đồ, report filters, Excel/PDF export

## Chạy nhanh

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:3006
- API Gateway: http://localhost:3000/api
- Frontend Health: http://localhost:3006/api/health
- Health: http://localhost:3000/api/health
- Readiness: http://localhost:3000/api/health/ready
- RabbitMQ UI: http://localhost:15672 (guest/guest)

Kiểm tra nhanh:

```bash
npm run health:check
npm run test:regression
npm run smoke:test
```

`npm run seed:demo` is intended for local demo stacks. It is blocked for non-local API URLs unless `ALLOW_DEMO_SEED_REMOTE=true` is set explicitly.

`npm run test:regression` also includes a static quality check for Docker runtime mode and mojibake text.

## Triển khai production

```bash
cp .env.production.example .env.production
npm run prod:deploy
```

Trước khi chạy thật, thay toàn bộ secret/password trong `.env.production`.
Đặt `BOOTSTRAP_ADMIN_EMAIL` và `BOOTSTRAP_ADMIN_PASSWORD` riêng cho tài khoản quản trị đầu tiên; không dùng lại mật khẩu database. Sau khi đăng nhập lần đầu nên đổi mật khẩu trong UI.
Đặt `SMOKE_ADMIN_EMAIL`/`SMOKE_ADMIN_PASSWORD` hoặc `SMOKE_ADMIN_ACCESS_TOKEN` khi chạy smoke test trên môi trường đã có admin hiện hữu.

Backup trước khi deploy hoặc nâng cấp:

```bash
npm run prod:backup
```

`npm run prod:deploy` is the recommended production path. It validates the env file, validates compose config with quiet output, runs the tracked security audit, runs migration preflight, creates a backup, deploys the stack, then runs health/smoke/log checks. Use direct `docker compose up` only for approved manual recovery.

`npm run prod:env:check` reads `.env.production` directly and rejects placeholder/weak production secrets. `.env.production` is ignored by git; keep only `.env.production.example` in source control.

Current quality gates:

```bash
npm run prod:env:check
npm run prod:config
npm run security:audit
npm run test:quality
npm run test:regression
npm run test:critical
npm run migrate:dry-run
npm run build --workspaces
```

`prod:config`, `prod:proxy:config`, and `observability:config` validate compose files with quiet output so production secrets are not dumped to the terminal.

Optional observability stack:

```bash
npm run observability:config
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.observability.yml --profile observability up -d
```

Grafana defaults to `http://localhost:3008`; set `GRAFANA_ADMIN_PASSWORD` in `.env.production` before enabling it.
Prometheus, Grafana, and Loki bind to `127.0.0.1` by default through `OBSERVABILITY_BIND_HOST` to avoid public exposure.

## Tài liệu đồ án

- `docs/ARCHITECTURE.md`
- `docs/DATABASE_DESIGN.md`
- `docs/API_SPEC.md`
- `docs/BUSINESS_FLOWS.md`
- `docs/ROADMAP.md`
- `docs/PRODUCTION_NOTES.md`
- `docs/OBSERVABILITY.md`
- `docs/DEPLOYMENT.md`
- `docs/BACKUP_RESTORE.md`
- `docs/TESTING.md`
