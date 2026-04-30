# Kiến trúc hệ thống

## Sơ đồ microservice

```mermaid
flowchart LR
  U[User/Browser] --> FE[Next.js Frontend]
  FE --> GW[API Gateway]
  GW --> AUTH[Auth Service]
  GW --> PROD[Product Service]
  GW --> INV[Inventory Service]
  GW --> TX[Transaction Service]
  GW --> REP[Report Service]
  AUTH --> AUTHDB[(auth_db)]
  PROD --> PRODDB[(product_db)]
  INV --> INVDB[(inventory_db)]
  TX --> TXDB[(transaction_db)]
  REP --> REPDB[(report_db)]
  TX <--> MQ[(RabbitMQ)]
  INV <--> MQ
  REP <--> MQ
  GW --> REDIS[(Redis)]
```

## Luồng request

1. Người dùng gọi Frontend.
2. Frontend gửi request tới API Gateway.
3. Gateway kiểm tra JWT, role và route tới service nội bộ.
4. Service xử lý nghiệp vụ với database riêng.
5. Các nghiệp vụ thay đổi tồn kho phát event qua RabbitMQ.
6. Report Service consume event để tạo dashboard/snapshot.

## Nguyên tắc tách service

- Không service nào truy cập database của service khác.
- Dữ liệu liên service dùng ID tham chiếu và API/event.
- Gateway là biên bảo mật; service nội bộ vẫn có thể validate JWT defense-in-depth.
