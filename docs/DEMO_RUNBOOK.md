# Demo Runbook - Warehouse Management System

## 1. Mở project trong Antigravity

```powershell
D:\Antigravity\bin\antigravity.cmd D:\ProjectCaNhan\warehouse-management-system
```

## 2. Chạy toàn bộ hệ thống

```powershell
cd D:\ProjectCaNhan\warehouse-management-system
docker compose up -d --build
```

## 3. Seed dữ liệu demo

```powershell
npm run seed:demo
```

Tài khoản demo:

- Email: `admin@wms.local`
- Password: `Password@123`

## 4. Kiểm tra nhanh

```powershell
npm run smoke:test
```

## 5. URL demo

- Frontend: http://localhost:3006
- API Gateway health: http://localhost:3000/api/health
- Product API: http://localhost:3000/api/products
- RabbitMQ UI: http://localhost:15672
  - user: `guest`
  - pass: `guest`

## 6. Điểm nói với giảng viên

- Hệ thống dùng kiến trúc microservice, không phải monolith.
- Mỗi service có database PostgreSQL riêng.
- API Gateway chịu trách nhiệm xác thực JWT và route request.
- Product Service đã kết nối PostgreSQL thật và có CRUD/search/pagination.
- Auth Service có đăng ký, đăng nhập, JWT, đổi mật khẩu và quản lý role.
- Docker Compose chạy toàn bộ stack: frontend, gateway, services, PostgreSQL, Redis, RabbitMQ.

## 7. Lệnh hữu ích

```powershell
docker compose ps
docker compose logs -f --tail=100 api-gateway auth-service product-service
docker compose down
docker compose up -d
```
