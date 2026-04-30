# Product Service

Product Service dùng PostgreSQL riêng: `product_db`.

## Endpoints qua Gateway

Tất cả route dưới đây cần Bearer token vì đi qua API Gateway.

### Categories

- GET /api/categories
- POST /api/categories
- PATCH /api/categories/:id
- DELETE /api/categories/:id

### Products

- GET /api/products?keyword=&categoryId=&page=1&limit=20
- POST /api/products
- GET /api/products/:id
- PATCH /api/products/:id
- DELETE /api/products/:id

## Ví dụ tạo sản phẩm

```json
{
  "sku": "SKU-001",
  "name": "Thùng carton A4",
  "description": "Thùng đóng gói chuẩn A4",
  "unit": "cái",
  "categoryId": "uuid",
  "costPrice": 12000
}
```
