# Auth Service + API Gateway

## Mục tiêu

Auth Service quản lý người dùng, mật khẩu, JWT và role. API Gateway là cổng public duy nhất cho frontend/client, chịu trách nhiệm verify JWT, áp dụng RBAC, gắn correlation id và proxy request đến service nội bộ.

## Auth endpoints qua Gateway

| Method | Endpoint | Quyền | Ghi chú |
|---|---|---|---|
| POST | `/api/auth/register` | Public, rate limit | Tạo user mới |
| POST | `/api/auth/login` | Public, rate limit | Đăng nhập lấy JWT |
| POST | `/api/auth/verify` | Bearer token | Verify token |
| GET | `/api/auth/me` | Bearer token | Lấy user hiện tại |
| PATCH | `/api/auth/change-password` | Bearer token | Đổi mật khẩu |
| GET | `/api/auth/users` | ADMIN | Danh sách user |
| PATCH | `/api/auth/users/:id/role` | ADMIN | Đổi role user |

## JWT claims

JWT được ký bởi Auth Service. Claims chuẩn:

```json
{
  "sub": "user-id",
  "email": "admin@wms.local",
  "role": "ADMIN",
  "fullName": "Demo Admin"
}
```

Response đăng nhập/đăng ký:

```json
{
  "accessToken": "jwt-token",
  "tokenType": "Bearer",
  "expiresIn": "1d",
  "user": {
    "id": "user-id",
    "email": "admin@wms.local",
    "fullName": "Demo Admin",
    "role": "ADMIN",
    "status": "ACTIVE"
  }
}
```

## Gateway rules

- `/api/auth/register` và `/api/auth/login` là public.
- Public auth endpoints có rate limit theo IP + path.
- Các route còn lại cần `Authorization: Bearer <token>`.
- Gateway gọi Auth Service `/api/auth/verify` trước khi proxy request private.
- Gateway trả/gắn `x-correlation-id` cho mọi request.
- Gateway forward user context xuống service nội bộ:
  - `x-user-id`
  - `x-user-email`
  - `x-user-role`
  - `x-user-full-name`
  - `x-correlation-id`

## RBAC hiện tại

| Role | Quyền chính |
|---|---|
| ADMIN | Full quyền |
| MANAGER | Đọc report, xem inventory, đọc product/category, thao tác transaction |
| WAREHOUSE_STAFF | Xem product/category/inventory, thao tác nhập/xuất transaction |

### Route policy

| Route | GET | Mutating methods |
|---|---|---|
| `/api/auth/users` | ADMIN | ADMIN |
| `/api/reports`, `/api/report` | ADMIN, MANAGER | ADMIN, MANAGER |
| `/api/inventory` | ADMIN, MANAGER, WAREHOUSE_STAFF | ADMIN, WAREHOUSE_STAFF |
| `/api/transactions`, `/api/transaction` | ADMIN, MANAGER, WAREHOUSE_STAFF | ADMIN, MANAGER, WAREHOUSE_STAFF |
| `/api/products`, `/api/product` | ADMIN, MANAGER, WAREHOUSE_STAFF | ADMIN, MANAGER |
| `/api/categories` | ADMIN, MANAGER, WAREHOUSE_STAFF | ADMIN, MANAGER |

> Ghi chú: ADMIN bypass mọi rule. Route chưa có rule cụ thể vẫn yêu cầu JWT nhưng chưa chặn theo role.

## Seed admin demo

Script `scripts/seed-demo-data.js` tạo hoặc đăng nhập admin demo:

```txt
email: admin@wms.local
password: Password@123
role: ADMIN
```

Chạy:

```powershell
npm run compose:up
npm run seed:demo
```

## Test nhanh

```powershell
$body = @{ email='admin@wms.local'; password='Password@123'; fullName='Admin'; role='ADMIN' } | ConvertTo-Json
try {
  $reg = Invoke-RestMethod http://localhost:3000/api/auth/register -Method Post -ContentType 'application/json' -Body $body
  $token = $reg.accessToken
} catch {
  $loginBody = @{ email='admin@wms.local'; password='Password@123' } | ConvertTo-Json
  $login = Invoke-RestMethod http://localhost:3000/api/auth/login -Method Post -ContentType 'application/json' -Body $loginBody
  $token = $login.accessToken
}

Invoke-RestMethod http://localhost:3000/api/auth/me -Headers @{ Authorization = "Bearer $token" }
Invoke-RestMethod http://localhost:3000/api/auth/users -Headers @{ Authorization = "Bearer $token" }
Invoke-RestMethod http://localhost:3000/api/gateway/me -Headers @{ Authorization = "Bearer $token" }
```

Build riêng Prompt 1:

```powershell
docker compose build api-gateway auth-service
```
