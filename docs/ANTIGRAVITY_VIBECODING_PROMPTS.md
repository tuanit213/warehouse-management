# Antigravity Vibecoding Prompts - WMS Microservices

Dùng file này để làm từng service theo thứ tự. Mỗi prompt nên chạy riêng trong Antigravity, sau mỗi bước hãy build/test Docker trước khi qua bước tiếp theo.

## Nguyên tắc chung

- Không biến hệ thống thành monolith.
- Mỗi service chỉ truy cập database của chính nó.
- Giao tiếp service-to-service đi qua REST hoặc RabbitMQ event.
- API public đi qua API Gateway.
- Mọi endpoint private cần JWT.
- Giữ code production-minded: DTO validation, error handling, pagination, logs, docs.
- Sau mỗi service phải cập nhật docs tương ứng trong `docs/`.

---

## Prompt 1 - Hoàn thiện Auth Service + Gateway RBAC

```text
Bạn là senior backend engineer. Trong repo Warehouse Management System microservices này, hãy hoàn thiện Auth Service và API Gateway theo hướng production-ready.

Bối cảnh hiện tại:
- Auth Service đã có register/login/verify/me/change-password/users/role.
- API Gateway đã proxy và verify JWT qua Auth Service.

Yêu cầu:
1. Thêm RBAC guard rõ ràng ở Gateway:
   - ADMIN: full quyền
   - MANAGER: đọc report, xem inventory, duyệt transaction
   - WAREHOUSE_STAFF: thao tác nhập/xuất, xem product/inventory
2. Chuẩn hóa JWT claims: sub, email, role, fullName.
3. Thêm middleware correlation-id cho Gateway.
4. Thêm rate limit cơ bản cho login/register nếu phù hợp.
5. Viết seed admin mặc định an toàn qua script hoặc SQL:
   - email: admin@wms.local
   - password: Password@123
6. Cập nhật docs/AUTH_GATEWAY.md.
7. Chạy docker compose build api-gateway auth-service và test register/login/me/users.

Không làm monolith, không để service khác đọc auth_db trực tiếp.
```

---

## Prompt 2 - Product Service hoàn chỉnh

```text
Bạn là senior backend engineer. Hãy hoàn thiện Product Service dùng PostgreSQL riêng `product_db`.

Hiện có:
- CRUD products/categories cơ bản.
- API Gateway route /api/products và /api/categories.

Yêu cầu:
1. Hoàn thiện Product APIs:
   - CRUD products
   - CRUD categories
   - Search theo keyword sku/name
   - Filter categoryId
   - Pagination page/limit
   - Sort createdAt/name/sku
2. Validate nghiệp vụ:
   - SKU unique, trim + uppercase SKU
   - Không xóa category nếu còn product thuộc category đó
   - costPrice >= 0
3. Thêm seed sample categories/products.
4. Thêm API lấy product summary cho Inventory/Transaction dùng REST nội bộ.
5. Cập nhật docs/PRODUCT_SERVICE.md với request/response mẫu.
6. Test qua Gateway bằng JWT.
7. Đảm bảo docker compose build product-service chạy thành công.

Không truy cập DB service khác.
```

---

## Prompt 3 - Inventory Service

```text
Bạn là senior backend engineer. Hãy implement Inventory Service dùng PostgreSQL riêng `inventory_db`.

Yêu cầu chức năng:
1. Warehouses:
   - CRUD warehouse: code, name, address, status
2. Warehouse locations:
   - CRUD location theo warehouse: code, description, status
3. Stock levels:
   - Xem tồn theo productId, warehouseId, locationId
   - Tạo/cập nhật minQuantity
   - API internal để tăng/giảm tồn từ Transaction Service
4. Alerts:
   - Low stock: quantity <= minQuantity
   - Aging stock: lastMovementAt quá số ngày cấu hình
5. Event/RabbitMQ:
   - Consume StockInboundConfirmed để tăng tồn
   - Consume StockOutboundConfirmed để trừ tồn
   - Publish StockLow event nếu dưới minQuantity
6. Validation:
   - Không cho trừ tồn âm
   - Warehouse/location phải ACTIVE
7. Cập nhật docs/INVENTORY_SERVICE.md.
8. Test Docker + Gateway endpoints.

Lưu ý:
- Inventory không đọc product_db trực tiếp. Nếu cần tên sản phẩm, gọi Product Service hoặc lưu read model tối thiểu từ event.
```

---

## Prompt 4 - Transaction Service

```text
Bạn là senior backend engineer. Hãy implement Transaction Service dùng PostgreSQL riêng `transaction_db`.

Yêu cầu chức năng:
1. Suppliers:
   - CRUD suppliers
   - contact_name, phone, email, address, status
2. Inbound receipts:
   - Tạo phiếu nhập DRAFT
   - Thêm/sửa/xóa item
   - Confirm phiếu nhập
   - Khi confirm publish RabbitMQ event StockInboundConfirmed
3. Outbound receipts:
   - Tạo phiếu xuất DRAFT
   - Thêm/sửa/xóa item
   - Trước confirm gọi Inventory Service kiểm tra tồn
   - Confirm phiếu xuất
   - Publish StockOutboundConfirmed
4. Transaction status:
   - DRAFT, CONFIRMED, CANCELLED
   - Không sửa item khi đã CONFIRMED
5. History:
   - Lưu created_by, confirmed_by, timestamps
6. PDF export:
   - Tạo endpoint `/api/inbounds/:id/pdf` và `/api/outbounds/:id/pdf`
   - Có thể dùng PDFKit hoặc HTML template đơn giản
7. Cập nhật docs/TRANSACTION_SERVICE.md.
8. Test flow nhập/xuất qua Gateway.

Không cập nhật inventory_db trực tiếp; chỉ dùng REST/event.
```

---

## Prompt 5 - Report Service

```text
Bạn là senior backend engineer. Hãy implement Report Service dùng PostgreSQL riêng `report_db`.

Yêu cầu:
1. Consume events từ RabbitMQ:
   - StockInboundConfirmed
   - StockOutboundConfirmed
   - StockLow
2. Lưu report_snapshots hoặc read models phục vụ dashboard.
3. APIs:
   - GET /api/reports/dashboard
   - GET /api/reports/inventory-value
   - GET /api/reports/inout-chart?from=&to=
   - GET /api/reports/low-stock
4. Export:
   - Excel bằng exceljs
   - PDF bằng pdfkit hoặc template đơn giản
5. Dashboard data gồm:
   - Tổng số sản phẩm
   - Tổng tồn kho
   - Giá trị tồn kho ước tính
   - Nhập/xuất theo ngày
   - Cảnh báo low stock
6. Không query DB service khác trực tiếp.
7. Cập nhật docs/REPORT_SERVICE.md.
8. Test qua Gateway với JWT role MANAGER/ADMIN.
```

---

## Prompt 6 - Frontend Dashboard

```text
Bạn là senior frontend engineer. Hãy xây dựng frontend Next.js cho WMS.

Yêu cầu:
1. Layout quản trị:
   - Sidebar
   - Header
   - Auth state
   - Responsive desktop-first
2. Pages:
   - Login
   - Dashboard
   - Products
   - Categories
   - Warehouses
   - Stock Levels
   - Inbound Receipts
   - Outbound Receipts
   - Suppliers
   - Reports
3. Tích hợp API Gateway:
   - NEXT_PUBLIC_API_URL=http://localhost:3000/api
   - Bearer token
   - Handle 401 redirect login
4. UI thực tế:
   - Table, search, pagination
   - Form create/edit
   - Toast/error state
5. Không dùng mock nếu API đã có thật.
6. Cập nhật README cách dùng frontend.
7. Test http://localhost:3006.
```

---

## Prompt 7 - Docker/DevOps/Production Polish

```text
Bạn là senior DevOps engineer. Hãy polish Docker và developer experience cho WMS.

Yêu cầu:
1. Tối ưu Dockerfile từng service:
   - multi-stage dev/prod nếu cần
   - healthcheck
   - non-root user nếu phù hợp
2. docker-compose:
   - healthcheck đầy đủ
   - depends_on condition healthy
   - volume rõ ràng
   - network nội bộ
3. Thêm scripts:
   - npm run compose:up
   - npm run compose:down
   - npm run seed
   - npm run smoke:test
4. Thêm docs DEPLOYMENT.md:
   - local dev
   - staging/prod concept
   - env variables
5. Thêm CI mẫu GitHub Actions:
   - build services
   - lint/test nếu có
6. Không phá workflow hiện tại.
```

---

## Prompt 8 - Final đồ án/documentation

```text
Bạn là senior software architect. Hãy hoàn thiện tài liệu đồ án cho hệ thống WMS microservices.

Yêu cầu output trong docs:
1. Kiến trúc hệ thống có sơ đồ Mermaid.
2. Luồng request qua Gateway.
3. Database design từng service.
4. API spec chính có request/response mẫu.
5. Luồng nghiệp vụ:
   - đăng nhập
   - nhập kho
   - xuất kho
   - low stock alert
6. Docker deployment.
7. Lộ trình phát triển 8 tuần.
8. Tính năng nâng cao:
   - RabbitMQ event-driven
   - logging/correlation id
   - monitoring
   - audit log
   - CI/CD
9. Viết bằng tiếng Việt, rõ ràng, phù hợp nộp giảng viên.
```
