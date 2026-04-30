# Warehouse Management System - Microservices

Hệ thống quản lý kho hàng cho doanh nghiệp vừa và nhỏ, thiết kế theo kiến trúc microservice và container hóa bằng Docker.

## Stack

- Frontend: Next.js + React + TypeScript
- Backend: NestJS + TypeScript
- Database: PostgreSQL riêng cho từng service
- Cache: Redis
- Message queue: RabbitMQ
- Container: Docker Compose

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

Sau khi chạy:

- Frontend: http://localhost:3006
- API Gateway: http://localhost:3000/api
- RabbitMQ UI: http://localhost:15672 (guest/guest)

## Tài liệu đồ án

- `docs/ARCHITECTURE.md`
- `docs/DATABASE_DESIGN.md`
- `docs/API_SPEC.md`
- `docs/BUSINESS_FLOWS.md`
- `docs/ROADMAP.md`
- `docs/PRODUCTION_NOTES.md`
