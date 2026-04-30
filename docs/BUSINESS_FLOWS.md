# Luồng nghiệp vụ

## Đăng nhập

1. User nhập email/password.
2. Gateway forward tới Auth Service.
3. Auth kiểm tra password hash, trạng thái user.
4. Auth phát JWT chứa userId, role.
5. Frontend lưu token an toàn và gọi API qua Gateway.

## Nhập kho

1. Nhân viên tạo phiếu nhập ở Transaction Service.
2. Chọn supplier, warehouse, products, quantities.
3. Khi xác nhận, Transaction Service publish event `StockInboundConfirmed`.
4. Inventory Service consume event và tăng stock_levels.
5. Report Service consume event để cập nhật dashboard.
6. Transaction Service sinh PDF phiếu nhập.

## Xuất kho

1. Nhân viên tạo phiếu xuất.
2. Transaction Service gọi Inventory Service kiểm tra tồn khả dụng.
3. Nếu đủ tồn, xác nhận phiếu và publish `StockOutboundConfirmed`.
4. Inventory Service trừ tồn, ghi last_movement_at.
5. Nếu tồn dưới min_quantity, phát cảnh báo low stock.
