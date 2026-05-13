# Antigravity Deep Debug Task - WMS Weeks 3, 4, 5

Bạn là senior full-stack architect + principal engineer. Hãy bật chế độ suy luận thật sâu, dành nhiều token để đọc toàn bộ repo trước khi sửa. Mục tiêu: debug chuyên sâu toàn bộ dự án Warehouse Management System, nâng cấp hệ thống và giao diện, tập trung hoàn thiện chắc phần Tuần 3, Tuần 4, Tuần 5.

Repo: `D:\ProjectCaNhan\warehouse-management-system`
Branch: `master`
Remote: `https://github.com/tuanit213/warehouse-management.git`

## Nguyên tắc bắt buộc

1. Đọc kỹ docs trước khi code:
   - `docs/ROADMAP.md`
   - `docs/API_SPEC.md`
   - `docs/ARCHITECTURE.md`
   - `docs/AUTH_GATEWAY.md`
   - `docs/PRODUCT_SERVICE.md`
   - `docs/BUSINESS_FLOWS.md`
   - `docs/DEMO_RUNBOOK.md`
2. Không phá form giao diện hiện tại đã được duyệt:
   - Sau login là app-shell quản trị.
   - Fixed topbar + left sidebar + right content panel.
   - Không quay lại landing hero / scroll dài từ trên xuống.
   - Commit chuẩn layout đang là `3e18c96 Refine dashboard app shell layout`.
3. Không dùng mock nếu API thật đã có.
4. Sau mỗi nhóm sửa lớn phải chạy build/test liên quan.
5. Nếu thay API phải cập nhật docs tương ứng.
6. Ưu tiên sửa triệt để hơn sửa nửa vời.

## Việc cần làm trước tiên: audit toàn bộ dự án

Hãy kiểm tra và ghi chú ngắn trong commit/summary:

- Git status, commit gần nhất.
- Tất cả service build được không.
- Gateway route có khớp API spec không.
- Auth role guard có bảo vệ đúng endpoint không.
- Product/Supplier/Inventory API có CRUD đầy đủ không.
- Frontend có gọi đúng endpoint không.
- Docker compose, seed demo, smoke test đang hỏng chỗ nào.

Chạy tối thiểu:

```powershell
npm run build --workspaces
npm run smoke:test
```

Nếu `smoke:test` fail vì stack chưa chạy, hãy kiểm tra script và Docker compose, rồi làm cho quy trình demo chạy được bằng:

```powershell
npm run compose:up
npm run seed:demo
npm run smoke:test
```

## Tuần 3 - Auth + Gateway: hoàn thiện sâu

Mục tiêu: Auth và Gateway đủ chắc để demo và đúng vai trò.

### Auth Service

- Kiểm tra/hoàn thiện:
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/refresh` nếu hiện chưa có thì implement đúng mức MVP.
  - `GET /auth/me`
  - `PATCH /auth/change-password`
  - `GET /auth/users`
  - `PATCH /auth/users/:id/role`
- Password phải hash bằng bcrypt/bcryptjs.
- JWT payload nên có user id, email, role.
- Validate DTO rõ ràng, trả lỗi dễ hiểu.
- Seed demo admin phải login được: `admin@wms.local` / `Password@123`.

### API Gateway

- Kiểm tra routing qua `/api` cho toàn bộ service:
  - auth
  - products/categories
  - warehouses/locations/stock-levels/stock-alerts
  - suppliers/transactions/inbounds/outbounds
  - reports
- Role rules:
  - ADMIN: full access.
  - MANAGER: xem/sửa nghiệp vụ chính, xem report, không quản lý role nhạy cảm nếu không cần.
  - WAREHOUSE_STAFF: xem product/inventory, thao tác inbound/outbound cơ bản.
- Thêm/giữ correlation id logging.
- Gateway phải forward lỗi JSON rõ, không nuốt lỗi service.
- CORS/frontend local phải hoạt động.

## Tuần 4 - Product + Supplier: hoàn thiện sâu

### Product Service

- CRUD products đầy đủ:
  - search keyword SKU/name
  - filter categoryId nếu API spec có
  - pagination metadata đúng
  - validate SKU unique
  - không xóa sản phẩm gây lỗi silent; nếu đang được dùng thì trả lỗi rõ hoặc soft guard phù hợp MVP
- CRUD categories đầy đủ.
- Dữ liệu trả về nên có `categoryName` nếu frontend đang dùng.

### Supplier

Supplier hiện nằm transaction-service theo API spec. Hoàn thiện:

- `GET /suppliers`
- `POST /suppliers`
- `PATCH /suppliers/:id`
- `DELETE /suppliers/:id`
- Search/filter cơ bản nếu dễ làm.
- Validate code/email/phone ở mức hợp lý.
- Frontend suppliers page phải tạo/sửa/xóa được, hiển thị lỗi rõ.

## Tuần 5 - Inventory: hoàn thiện sâu

Inventory Service cần chắc cho demo:

- CRUD warehouses.
- CRUD locations theo warehouse.
- `GET /stock-levels?warehouseId=&productId=` đúng filter.
- Update stock level endpoint nếu frontend đang gọi.
- Low stock alert đúng logic `quantity <= minQuantity`.
- Aging alert có logic MVP rõ ràng dựa trên `lastMovementAt` hoặc created/updated date.
- Không cho location không thuộc warehouse khi update stock.
- Kiểm tra transaction confirm inbound/outbound có cập nhật tồn kho đúng không.
- Nếu dùng event/RabbitMQ thì đảm bảo fallback/consistency đủ demo; nếu chưa event-driven hoàn chỉnh thì document rõ MVP synchronous path.

## Frontend nâng cấp nhưng giữ form hiện tại

Không đổi layout tổng thể. Chỉ polish trong right content panel:

- Hiển thị loading/error/toast tốt hơn.
- Các form có trạng thái edit/cancel rõ.
- Sidebar active rõ, không gây scroll toàn trang.
- Bảng dài chỉ scroll trong content/table, không kéo cả landing page.
- Reports dashboard hiển thị số liệu thật từ `/reports/dashboard` nếu có.
- Không làm lại thành landing page.

## Debug chuyên sâu cần kiểm tra

- TypeScript build toàn bộ workspace.
- Endpoint mismatch giữa frontend và Gateway.
- Tên route singular/plural: `/report` vs `/reports`, `/transaction` vs `/transactions`.
- Docker healthcheck và port:
  - frontend: 3006
  - gateway: 3000
  - auth: 3001
  - product: 3002
  - inventory: 3003
  - transaction: 3004
  - report: 3005
- Encoding tiếng Việt trong docs/UI nếu đang bị lỗi mojibake thì sửa các file người dùng nhìn thấy.
- Seed demo có đủ product, warehouse, supplier, stock, transaction để demo dashboard.

## Definition of Done

Trước khi kết thúc phải đạt:

```powershell
npm run build --workspaces
npm run compose:up
npm run seed:demo
npm run smoke:test
```

Nếu không thể chạy Docker trên máy, vẫn phải chạy build workspace và ghi rõ blocker.

## Output mong muốn

1. Commit code với message rõ ràng.
2. Summary ngắn:
   - Đã sửa gì cho tuần 3.
   - Đã sửa gì cho tuần 4.
   - Đã sửa gì cho tuần 5.
   - Đã nâng cấp UI gì.
   - Test/build đã chạy và kết quả.
3. Không tự push nếu chưa được yêu cầu riêng; để Nia/user review rồi push.
