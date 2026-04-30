# Thiết kế API chính

Base URL qua Gateway: `/api`

## Auth Service

- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- GET /auth/me
- PATCH /auth/change-password
- GET /auth/users
- PATCH /auth/users/:id/role

Ví dụ login:

```json
{ "email": "admin@wms.local", "password": "Password@123" }
```

Response:

```json
{ "accessToken": "jwt", "refreshToken": "token", "user": { "id": "uuid", "role": "ADMIN" } }
```

## Product Service

- GET /products?keyword=&categoryId=&page=1&limit=20
- POST /products
- GET /products/:id
- PATCH /products/:id
- DELETE /products/:id
- GET/POST/PATCH/DELETE /categories

## Inventory Service

- GET/POST/PATCH/DELETE /warehouses
- GET/POST/PATCH/DELETE /warehouses/:id/locations
- GET /stock-levels?warehouseId=&productId=
- GET /stock-alerts/low-stock
- GET /stock-alerts/aging

## Transaction Service

- POST /inbounds
- POST /inbounds/:id/confirm
- GET /inbounds/:id/pdf
- POST /outbounds
- POST /outbounds/:id/confirm
- GET/POST/PATCH/DELETE /suppliers

## Report Service

- GET /reports/dashboard
- GET /reports/inventory-value
- GET /reports/inout-chart?from=&to=
- GET /reports/export/excel
- GET /reports/export/pdf
