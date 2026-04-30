# Thiết kế database

## Auth Service

- users: tài khoản, role, trạng thái.
- refresh_tokens: quản lý phiên đăng nhập.

## Product Service

- categories: danh mục cha/con.
- products: SKU, tên, mô tả, đơn vị tính, giá vốn.

## Inventory Service

- warehouses: nhiều kho.
- warehouse_locations: vị trí/bin trong kho.
- stock_levels: tồn kho theo sản phẩm/kho/vị trí, min_quantity, last_movement_at.

## Transaction Service

- suppliers: nhà cung cấp.
- stock_transactions: phiếu nhập/xuất.
- stock_transaction_items: dòng sản phẩm trong phiếu.

## Report Service

- report_snapshots: snapshot JSON cho dashboard/report định kỳ.

## ERD tổng quan

Xem các file SQL trong `database/init/*.sql`. Mỗi service sở hữu database riêng khi chạy Docker Compose.
