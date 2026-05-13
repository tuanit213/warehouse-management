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
- POST /stock-levels
- POST /stock-levels/adjust
- GET /stock-alerts/low-stock
- GET /stock-alerts/aging
- GET /stock-movements?warehouseId=&productId=

## Transaction Service

- GET /transactions?type=&status=
- GET /transactions/:id
- POST /transactions/:id/confirm
- POST /transactions/:id/cancel
- POST /inbounds
- POST /inbounds/:id/confirm
- POST /inbounds/:id/cancel
- GET /inbounds/:id/pdf
- POST /outbounds
- POST /outbounds/:id/confirm
- POST /outbounds/:id/cancel
- GET/POST/PATCH/DELETE /suppliers

## Report Service

- GET /reports/dashboard
- GET /reports/summary
- GET /reports/inventory-value
- GET /reports/low-stock
- GET /reports/stock-movements?warehouseId=&productId=
- GET /reports/inout-chart?from=&to=
- GET /reports/export/excel?kind=inventory|low-stock|movements
- GET /reports/export/pdf
