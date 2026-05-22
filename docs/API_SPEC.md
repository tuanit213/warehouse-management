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
- PATCH /auth/users/:id/status

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
- GET /products/export/csv
- POST /products/import/csv
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
- POST /stock-transfers
- GET /stock-alerts/low-stock
- GET /stock-alerts/aging
- GET /stock-movements?warehouseId=&productId=
- GET /stock-reservations?warehouseId=&productId=&status=
- POST /stock-reservations
- POST /stock-reservations/:id/release
- POST /stock-reservations/release-reference/:referenceType/:referenceId
- POST /stock-reservations/consume-reference/:referenceType/:referenceId
- GET /stocktakes?warehouseId=&status=
- GET /stocktakes/:id
- POST /stocktakes
- PATCH /stocktakes/:id/counts
- POST /stocktakes/:id/approve

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
- GET /outbounds/:id/pdf
- GET/POST/PATCH/DELETE /suppliers

## Report Service

- GET /reports/dashboard
- GET /reports/summary
- GET /reports/inventory-value?warehouseId=&productId=
- GET /reports/low-stock?warehouseId=&productId=
- GET /reports/stock-movements?warehouseId=&productId=
- GET /reports/inout-chart?from=&to=
- GET /reports/export/excel?kind=inventory|low-stock|movements&warehouseId=&productId=
- GET /reports/export/pdf?warehouseId=&productId=

`/reports/export/excel` returns a real `.xlsx` workbook with content type
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

## Payload Notes

- `PATCH /auth/users/:id/status` accepts `{ "status": "ACTIVE" | "DISABLED" }`. Disabling a user revokes active refresh tokens. A user cannot disable their own account.
- `POST /products/import/csv` accepts `{ "csv": "...", "dryRun": true }` for preview and `{ "csv": "..." }` to apply. Dry-run does not create products or categories.
- Stock reservations reserve available stock for a reference such as `{ "referenceType": "transaction", "referenceId": "uuid" }`. Reserved quantity is returned by stock level APIs as `reservedQuantity` and `availableQuantity`.
- Stocktake approval requires a reason and writes audited `ADJUSTMENT` stock movements with `referenceType=stocktake`.
