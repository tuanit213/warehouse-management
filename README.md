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

## Services

- frontend: giao diện quản trị
- api-gateway: cổng API, xác thực JWT, route nội bộ
- auth-service: người dùng, đăng nhập, phân quyền
- product-service: sản phẩm, SKU, danh mục
- inventory-service: kho, vị trí, tồn kho, cảnh báo
- transaction-service: nhập/xuất kho, lịch sử, PDF
- report-service: dashboard, biểu đồ, export

## Chạy nhanh

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:3006
- API Gateway: http://localhost:3000/api
- Health: http://localhost:3000/api/health
- Readiness: http://localhost:3000/api/health/ready
- RabbitMQ UI: http://localhost:15672 (guest/guest)

Kiểm tra nhanh:

```bash
npm run health:check
npm run test:regression
npm run smoke:test
```

## Triển khai production

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Trước khi chạy thật, thay toàn bộ secret/password trong `.env.production`.

## Tài liệu đồ án

- `docs/ARCHITECTURE.md`
- `docs/DATABASE_DESIGN.md`
- `docs/API_SPEC.md`
- `docs/BUSINESS_FLOWS.md`
- `docs/ROADMAP.md`
- `docs/PRODUCTION_NOTES.md`
- `docs/OBSERVABILITY.md`
- `docs/DEPLOYMENT.md`
- `docs/TESTING.md`
