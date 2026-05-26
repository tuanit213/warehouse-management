# Production Readiness Task List

Current completion estimate: 99.8%.

Remaining gap to 100%: T-004 requires real server access, production domain/DNS, and production secrets to deploy and verify the live URL, health, smoke flows, and logs.

## Status Scale

- `TODO`: Chưa làm.
- `IN_PROGRESS`: Đang làm trong vòng lặp hiện tại.
- `DONE`: Đã implement và kiểm tra.
- `BLOCKED`: Cần credential, quyền server, domain, API key, hoặc xác nhận thao tác nguy hiểm.

## Tasks

### T-001 - Harden production smoke and bootstrap credentials

- Mục tiêu: Tách mật khẩu admin khỏi mật khẩu database, cho smoke test dùng credential hoặc access token riêng.
- File liên quan: `docker-compose.prod.yml`, `.env.production.example`, `scripts/validate-production-env.js`, `scripts/smoke-test.js`, `scripts/seed-demo-data.js`, `scripts/e2e-workflow-test.js`, `README.md`, `docs/production-deployment.md`, `docs/PRODUCTION_NOTES.md`.
- Các bước thực hiện: Bắt production compose yêu cầu `BOOTSTRAP_ADMIN_PASSWORD`; validator từ chối reuse `POSTGRES_PASSWORD`; bỏ fallback script sang `POSTGRES_PASSWORD`; thêm `SMOKE_ADMIN_*` và token mode cho smoke/E2E; cập nhật docs.
- Tiêu chí hoàn thành: `prod:env:check` pass với env hợp lệ; smoke pass khi cung cấp credential/token đúng; không hard-code secret.
- Cách kiểm tra: `npm run prod:env:check`, `npm run smoke:test`, `npm run test:regression`, `npm run build --workspaces`.
- Trạng thái: DONE.
- Mức ưu tiên: P0.

### T-002 - Keep quality gates green after PDF renderer changes

- Mục tiêu: Đảm bảo HTML/Puppeteer PDF không phá build/test/runtime Docker.
- File liên quan: `services/transaction-service/src/transaction-pdf.renderer.ts`, `services/transaction-service/src/transaction.service.ts`, `services/transaction-service/Dockerfile`, `scripts/smoke-test.js`.
- Các bước thực hiện: Build all workspaces; transaction regression; Docker production build; health; PDF smoke valid/invalid id.
- Tiêu chí hoàn thành: PDF endpoint trả `application/pdf`, size hợp lý, invalid id trả 400; Docker image có Chromium/font.
- Cách kiểm tra: `npm run build --workspaces`, `npm run test:transactions`, production compose build, targeted PDF smoke.
- Trạng thái: DONE.
- Mức ưu tiên: P0.

### T-003 - Run full live smoke with real production-like credentials

- Mục tiêu: Xác minh gateway flows chính bằng credential admin hiện hữu.
- File liên quan: `scripts/smoke-test.js`, `.env.production`.
- Các bước thực hiện: Cấu hình `SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_PASSWORD` hoặc `SMOKE_ADMIN_ACCESS_TOKEN`; chạy smoke; kiểm tra PDF, Excel, stock transfer, transaction confirm.
- Tiêu chí hoàn thành: Smoke test pass không cần fallback secret yếu.
- Cách kiểm tra: `npm run smoke:test`.
- Trạng thái: DONE.
- Mức ưu tiên: P0.

### T-004 - Production deploy to real server

- Mục tiêu: Deploy stack lên server thật và xác minh URL production.
- File liên quan: `.env.production`, `docker-compose.yml`, `docker-compose.prod.yml`, docs deploy/rollback/backup.
- Các bước thực hiện: Nhận SSH/server access/domain; backup; validate env; pull/build images; run migrations/preflight; deploy; health/smoke; inspect logs.
- Tiêu chí hoàn thành: Production URL truy cập được, health/readiness ok, flow chính pass, log không có lỗi nghiêm trọng.
- Cách kiểm tra: URL frontend/API, `npm run health:check`, `npm run smoke:test`, `docker compose logs`.
- Trạng thái: BLOCKED.
- Mức ưu tiên: P0.

### T-005 - Resolve or track dependency advisories

- Mục tiêu: Không còn advisory production có fix an toàn, hoặc có ghi chú/tracking rõ.
- File liên quan: `package.json`, `package-lock.json`, `docs/PRODUCTION_NOTES.md`.
- Các bước thực hiện: Chạy audit; cập nhật `qs` lên bản vá không breaking; đánh giá fix; không dùng `npm audit fix --force` nếu downgrade/breaking; cập nhật Next khi có bản stable vá advisory.
- Tiêu chí hoàn thành: `npm audit --omit=dev` sạch hoặc advisory được documented với lý do không fix.
- Cách kiểm tra: `npm audit --omit=dev --workspaces --include-workspace-root`.
- Trạng thái: DONE.
- Mức ưu tiên: P1.

### T-006 - Live E2E and critical checks with production URL/token

- Mục tiêu: Chạy các nhánh live đang skip trong regression/critical.
- File liên quan: `scripts/e2e-workflow-test.js`, `scripts/auth-critical-test.js`, `scripts/inventory-concurrency-test.js`, `scripts/transaction-idempotency-test.js`.
- Các bước thực hiện: Cung cấp `WMS_API_URL`, admin/test token, test product/warehouse ids; chạy critical live; xử lý lỗi nếu có.
- Tiêu chí hoàn thành: Không còn skip live quan trọng trên staging/production.
- Cách kiểm tra: `npm run test:e2e`, `npm run test:critical` với env live.
- Trạng thái: DONE.
- Mức ưu tiên: P1.

### T-007 - Backup and restore drill

- Mục tiêu: Chứng minh backup/restore hoạt động trên môi trường không phá production.
- File liên quan: `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `docs/BACKUP_RESTORE.md`.
- Các bước thực hiện: Tạo backup; restore vào môi trường test hoặc fresh volumes; kiểm tra dữ liệu và upload files; nếu dùng PostgreSQL tạm, tạo role DB khớp owner trong dump trước khi restore.
- Tiêu chí hoàn thành: Restore thành công trên môi trường không ảnh hưởng stack hiện tại, không mất product uploads, documented result.
- Cách kiểm tra: backup folder, restore logs, row count các bảng chính trên DB restore tạm.
- Trạng thái: DONE.
- Mức ưu tiên: P1.

### T-008 - Production observability verification

- Mục tiêu: Xác minh Prometheus/Grafana/Loki profile thật sự scrape và hiển thị log/metrics.
- File liên quan: `docker-compose.observability.yml`, `ops/prometheus/prometheus.yml`, `ops/grafana`, `ops/loki`, `ops/promtail`, `docs/OBSERVABILITY.md`.
- Các bước thực hiện: Deploy observability profile; kiểm tra targets; kiểm tra dashboard; kiểm tra log labels/correlation id.
- Tiêu chí hoàn thành: Metrics/logs thấy được cho gateway và services.
- Cách kiểm tra: Prometheus targets, Grafana dashboard, Loki log query.
- Trạng thái: DONE.
- Mức ưu tiên: P2.

### T-009 - Frontend production UX/accessibility pass

- Mục tiêu: Kiểm tra UI chính không overflow, flow chính ergonomic, error tiếng Việt rõ.
- File liên quan: `frontend/features/home/HomeClient.tsx`, `frontend/app/styles.css`, shared components.
- Các bước thực hiện: Run frontend build; browser smoke desktop/mobile; inspect login, dashboard, products, inventory, transaction PDF, reports.
- Tiêu chí hoàn thành: Không lỗi console nghiêm trọng, không layout overlap ở viewport chính, các action chính có feedback.
- Cách kiểm tra: Manual/browser smoke, screenshots nếu cần.
- Trạng thái: DONE.
- Mức ưu tiên: P2.

### T-010 - Automate observability verification

- Mục tiêu: Biến kiểm tra Prometheus/Grafana/Loki thành gate lặp lại được cho local, staging và production.
- File liên quan: `scripts/observability-check.js`, `package.json`, `docs/OBSERVABILITY.md`.
- Các bước thực hiện: Thêm script kiểm tra Prometheus active targets, Grafana `/api/health`, Loki `/ready` và log streams WMS; thêm npm script; cập nhật docs cách chạy và override URL.
- Tiêu chí hoàn thành: Script fail rõ khi thiếu target, target down, Grafana DB lỗi, Loki chưa ready hoặc không có log stream WMS gần đây.
- Cách kiểm tra: `npm run observability:check`.
- Trạng thái: DONE.
- Mức ưu tiên: P2.

### T-011 - Automate post-deploy serious log scan

- Mục tiêu: Thay bước inspect logs thủ công bằng gate phát hiện lỗi nghiêm trọng sau deploy.
- File liên quan: `scripts/production-log-check.js`, `package.json`, `docs/production-deployment.md`, `docs/DEPLOYMENT.md`.
- Các bước thực hiện: Thêm script đọc logs các container WMS core, kiểm tra container đang chạy, scan fatal/error/unhandled/connection/migration patterns, hỗ trợ cấu hình `LOG_CHECK_SINCE`, `LOG_CHECK_TAIL`, `LOG_CHECK_CONTAINERS`; cập nhật deploy docs.
- Tiêu chí hoàn thành: Script pass khi log sạch và fail kèm sample khi phát hiện lỗi nghiêm trọng hoặc container thiếu/dừng.
- Cách kiểm tra: `npm run prod:logs:check`.
- Trạng thái: DONE.
- Mức ưu tiên: P1.

### T-012 - Add executable production deployment workflow

- Mục tiêu: Chuẩn hóa deploy production thành một script có dry-run để giảm thao tác tay khi có server/credential.
- File liên quan: `scripts/deploy-production.ps1`, `package.json`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`.
- Các bước thực hiện: Thêm PowerShell deploy orchestrator; load env an toàn; derive `API_URL` từ `NEXT_PUBLIC_API_URL` và `FRONTEND_URL` từ `CORS_ORIGIN` cho verification; validate env/compose; chạy migration preflight, backup, compose up, health, smoke, observability optional và log scan; thêm `npm run prod:deploy`; cập nhật docs.
- Tiêu chí hoàn thành: `-DryRun` in đúng thứ tự lệnh, hỗ trợ observability profile, health/smoke dùng production URLs cấu hình trong env, không in secret, không thay đổi stack khi dry-run.
- Cách kiểm tra: `powershell -ExecutionPolicy Bypass -File scripts/deploy-production.ps1 -DryRun -WithObservability -SkipBackup`.
- Trạng thái: DONE.
- Mức ưu tiên: P0.

### T-013 - Harden public production URL validation

- Mục tiêu: Ngăn deploy production thật với URL localhost/private hoặc thiếu public product URL.
- File liên quan: `scripts/validate-production-env.js`, `.env.production.example`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`.
- Các bước thực hiện: Bắt buộc `PRODUCT_PUBLIC_BASE_URL`; validate `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`, `PRODUCT_PUBLIC_BASE_URL` là URL tuyệt đối; yêu cầu HTTPS public host; reject localhost/private host mặc định; cho phép override `ALLOW_LOCAL_PRODUCTION_URLS=true` chỉ cho local production-like validation; cập nhật docs/example.
- Tiêu chí hoàn thành: Validator fail với localhost/private URL production, pass với HTTPS public URL và secrets hợp lệ, docs ghi rõ override local.
- Cách kiểm tra: `npm run prod:env:check` với env tạm public hợp lệ và env tạm localhost không override.
- Trạng thái: DONE.
- Mức ưu tiên: P0.

### T-015 - Make frontend API URL runtime-configurable

- Muc tieu: Dam bao frontend Docker image co the dung API public URL tu env runtime, khong bi bake sai `NEXT_PUBLIC_API_URL` luc build.
- File lien quan: `frontend/lib/api.ts`, `frontend/app/layout.tsx`, `frontend/app/api/runtime-config/route.ts`.
- Cac buoc thuc hien: Them route runtime config tra JavaScript no-store; load script bang `next/script` truoc khi client bundle chay; uu tien `window.__WMS_CONFIG__.apiUrl` trong API helper; giu fallback build-time/localhost de backward compatible.
- Tieu chi hoan thanh: HTML tai script runtime config; client API helper doc duoc URL runtime; build frontend pass; khong can rebuild image rieng cho moi domain.
- Cach kiem tra: `npm run build --workspace frontend`; chay standalone/container voi `NEXT_PUBLIC_API_URL` runtime va kiem tra `/api/runtime-config` tra dung URL.
- Trang thai: DONE.
- Muc uu tien: P0.

### T-016 - Guard production smoke and demo seed credentials

- Muc tieu: Khong de smoke/E2E remote am tham dung fallback demo/bootstrap password va khong seed demo vao API remote do nham lenh.
- File lien quan: `scripts/lib/env-safety.js`, `scripts/smoke-test.js`, `scripts/e2e-workflow-test.js`, `scripts/seed-demo-data.js`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `README.md`.
- Cac buoc thuc hien: Them helper phan biet API local/remote; bat buoc credential rieng cho smoke/E2E remote; chan seed demo remote neu khong co `ALLOW_DEMO_SEED_REMOTE=true`; cap nhat docs.
- Tieu chi hoan thanh: Remote smoke/E2E khong co credential rieng fail truoc khi goi API; seed demo remote fail truoc khi mutate; local smoke van pass voi credential hop le.
- Cach kiem tra: Chay guard negative tests voi URL `https://api.example.test/api`; chay `npm run smoke:test`, `npm run test:e2e`, `npm run test:regression`.
- Trang thai: DONE.
- Muc uu tien: P0.

### T-017 - Add explicit confirmation gate for destructive restore

- Muc tieu: Ngan restore production ghi de database/uploads do nham lenh va cho phep kiem tra plan truoc khi restore.
- File lien quan: `scripts/restore-production.ps1`, `docs/BACKUP_RESTORE.md`, `docs/rollback-plan.md`.
- Cac buoc thuc hien: Them `-DryRun` de validate backup files va in restore plan; bat buoc `-ConfirmRestore` truoc khi chay psql/docker cp; dung `ON_ERROR_STOP=1` khi restore SQL; cap nhat runbook rollback/backup.
- Tieu chi hoan thanh: Restore khong co `-ConfirmRestore` fail truoc khi ghi du lieu; `-DryRun` pass voi backup hop le va khong mutate; docs yeu cau dry-run va confirm ro rang.
- Cach kiem tra: Chay restore dry-run voi backup hien co; chay restore khong confirm va xac minh fail an toan; chay regression/build lien quan.
- Trang thai: DONE.
- Muc uu tien: P0.

### T-018 - Add backup integrity manifest and restore checksum validation

- Muc tieu: Phat hien backup thieu/hong truoc khi restore va ghi lai metadata can thiet cho drill/incident.
- File lien quan: `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `docs/BACKUP_RESTORE.md`.
- Cac buoc thuc hien: Backup tao `manifest.json` gom DB/container/file/bytes/SHA256 va metadata product uploads; backup fail neu dump rong/pg_dump loi; restore dry-run/confirm validate file size va checksum khi co manifest; backup cu khong manifest van duoc chap nhan kem warning.
- Tieu chi hoan thanh: Backup moi co manifest; restore dry-run backup moi verify manifest; restore backup cu khong manifest van dry-run duoc; build/regression pass.
- Cach kiem tra: `npm run prod:backup`; `npm run prod:restore -- -BackupPath <backup-moi> -DryRun`; `npm run prod:restore -- -BackupPath .\\backups\\20260523-004946 -DryRun`; regression/build.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-019 - Preflight smoke credentials before production deploy

- Muc tieu: Fail som neu deploy production bat smoke test nhung thieu credential smoke, tranh deploy xong moi hong verification.
- File lien quan: `scripts/deploy-production.ps1`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`.
- Cac buoc thuc hien: Them check `SMOKE_ADMIN_EMAIL`+`SMOKE_ADMIN_PASSWORD` hoac `SMOKE_ADMIN_ACCESS_TOKEN`/`WMS_ADMIN_ACCESS_TOKEN`; chay check truoc migration/backup/deploy khi khong co `-SkipSmoke`; cap nhat docs.
- Tieu chi hoan thanh: Dry-run/deploy khong `-SkipSmoke` fail som khi thieu smoke credential; dry-run co smoke credential pass den cac buoc lenh; `-SkipSmoke` bo qua check.
- Cach kiem tra: Dry-run voi env tam public hop le khong smoke credential; dry-run voi token gia lap; dry-run `-SkipSmoke`; regression/build.
- Trang thai: DONE.
- Muc uu tien: P0.

### T-020 - Make production compose validation quiet and effective in dry-run

- Muc tieu: Tranh in resolved Docker Compose secrets ra terminal/log va dam bao deploy dry-run van bat loi env/compose som.
- File lien quan: `scripts/deploy-production.ps1`, `package.json`, `README.md`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`.
- Cac buoc thuc hien: Doi deploy compose validation sang `config --quiet`; cho dry-run thuc thi cac validation an toan `prod:env:check` va compose config; doi npm config scripts sang quiet; cap nhat docs.
- Tieu chi hoan thanh: Dry-run voi env sai fail o env validation; dry-run voi env dung chay validation that va chi in lenh khong co resolved secret; npm config scripts khong dump config; regression/build pass.
- Cach kiem tra: Dry-run negative/positive voi env tam; `npm run prod:config` voi env tam hop le; regression/build.
- Trang thai: DONE.
- Muc uu tien: P0.

### T-021 - Bind observability ports to localhost by default

- Muc tieu: Khong vo tinh expose Prometheus/Grafana/Loki ra internet khi bat observability profile tren production.
- File lien quan: `docker-compose.observability.yml`, `.env.production.example`, `scripts/validate-production-env.js`, `README.md`, `docs/OBSERVABILITY.md`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`.
- Cac buoc thuc hien: Them `OBSERVABILITY_BIND_HOST` mac dinh `127.0.0.1` vao port mappings; them env example; validator fail neu bind `0.0.0.0`/`::` ma khong co `OBSERVABILITY_EXPOSE_PUBLIC=true`; cap nhat docs ve SSH tunnel/firewall/proxy auth.
- Tieu chi hoan thanh: Compose observability render voi localhost bind; validator chan public bind mac dinh; public bind pass chi khi co flag explicit; regression/build pass.
- Cach kiem tra: Compose config voi env tam; `prod:env:check` negative/positive; `observability:check`; regression/build.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-022 - Require explicit confirmation for skipped deploy safety gates

- Muc tieu: Ngan bo qua backup/migration/smoke/log scan do nham lenh khi deploy production.
- File lien quan: `scripts/deploy-production.ps1`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`.
- Cac buoc thuc hien: Them `-ConfirmSkipGates`; neu dung `-SkipBackup`, `-SkipMigratePreflight`, `-SkipSmoke`, hoac `-SkipLogCheck` ma khong confirm thi fail som; neu confirm thi in warning gate bi skip; cap nhat docs.
- Tieu chi hoan thanh: Dry-run co skip ma thieu confirm fail som; dry-run co skip va confirm pass; dry-run khong skip khong can confirm; regression/build pass.
- Cach kiem tra: Chay deploy dry-run negative/positive voi env tam; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P0.

### T-023 - Guard production deploys from dirty worktrees and stale images

- Muc tieu: Tranh deploy production tu thay doi chua commit hoac bo qua build image do nham lenh.
- File lien quan: `scripts/deploy-production.ps1`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`.
- Cac buoc thuc hien: Them `-AllowDirtyWorktree`; real deploy fail neu git worktree dirty va khong co flag; dry-run chi warning; them `-NoBuild` vao safety gates can `-ConfirmSkipGates`; cap nhat docs.
- Tieu chi hoan thanh: Dry-run worktree dirty warning nhung pass; real deploy path se fail truoc khi deploy neu dirty khong allow; dry-run `-NoBuild` thieu confirm fail; `-NoBuild -ConfirmSkipGates` pass.
- Cach kiem tra: Chay deploy dry-run voi env tam va worktree dirty; dry-run `-NoBuild` negative/positive; regression/build.
- Trang thai: DONE.
- Muc uu tien: P0.

### T-024 - Add tracked production security audit gate

- Muc tieu: Bien advisory Next/PostCSS da biet thanh gate lap lai duoc, fail khi co advisory moi hoac khi co Next stable moi can review.
- File lien quan: `scripts/security-audit-check.js`, `package.json`, `docs/PRODUCTION_NOTES.md`.
- Cac buoc thuc hien: Them script chay `npm audit --omit=dev --workspaces --include-workspace-root --json`; cho phep dung advisory PostCSS transitive qua Next neu latest Next van bang version dang dung va fix cua npm la downgrade breaking; fail voi advisory la hoac Next latest moi; cap nhat docs.
- Tieu chi hoan thanh: `npm run security:audit` pass co warning voi advisory tracked hien tai; raw `npm audit` van duoc ghi nhan; regression/build/smoke pass.
- Cach kiem tra: `npm run security:audit`; `npm audit --omit=dev --workspaces --include-workspace-root`; regression/build.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-025 - Wire security audit into CI quality gates

- Muc tieu: Dam bao gate security audit va compose validation an toan chay tren CI, khong chi chay thu cong.
- File lien quan: `.github/workflows/ci.yml`, `README.md`, `docs/TESTING.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Doi CI compose validation sang `docker compose config --quiet`; them buoc `npm run security:audit` sau install/compose validation; cap nhat danh sach quality gates va testing docs.
- Tieu chi hoan thanh: CI workflow co security audit gate; compose validation khong dump resolved config; docs liet ke command security audit trong quality gates.
- Cach kiem tra: `npm run security:audit`; `docker compose config --quiet`; `npm run test:quality`; regression/build neu can.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-026 - Align live critical test credentials with E2E

- Muc tieu: Giam loi van hanh khi chay live critical tests va ngan remote write test dung bootstrap/demo fallback.
- File lien quan: `scripts/inventory-concurrency-test.js`, `scripts/transaction-idempotency-test.js`, `docs/TESTING.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Cho critical live tests doc `E2E_ADMIN_*`, `SMOKE_ADMIN_*`, va access-token aliases; them remote credential guard bang `requireDedicatedCredentialsForRemote`; cap nhat testing docs.
- Tieu chi hoan thanh: `npm run test:critical` pass voi `E2E_ADMIN_*` tren local stack; remote target khong duoc dung bootstrap/demo fallback khi bat live write; docs ghi ro env can dung.
- Cach kiem tra: `npm run test:critical` voi `WMS_API_URL` local va `E2E_ADMIN_*`; regression/build.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-027 - Reject local placeholder admin emails in production validation

- Muc tieu: Ngan deploy production khi van de `BOOTSTRAP_ADMIN_EMAIL` hoac `SMOKE_ADMIN_EMAIL` la email mau/local nhu `admin@wms.local`.
- File lien quan: `scripts/validate-production-env.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Validate bootstrap/smoke email bang format email; reject placeholder/default values; reject local/private email domain khi khong bat `ALLOW_LOCAL_PRODUCTION_URLS=true`.
- Tieu chi hoan thanh: Env production hop le voi email public pass; env dung `admin@wms.local` fail ro rang; local production-like validation van co override explicit.
- Cach kiem tra: `npm run prod:env:check` voi env tam hop le; negative validator voi `BOOTSTRAP_ADMIN_EMAIL=admin@wms.local`; regression/build lien quan.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-028 - Validate optional production credentials

- Muc tieu: Khong de placeholder/weak optional credential lot qua deploy preflight khi operator da cau hinh smoke hoac observability.
- File lien quan: `scripts/validate-production-env.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them validate cho `SMOKE_ADMIN_PASSWORD`, `SMOKE_ADMIN_ACCESS_TOKEN`, `WMS_ADMIN_ACCESS_TOKEN`, va `GRAFANA_ADMIN_PASSWORD` neu chung duoc set; reject placeholder, gia tri yeu, token ngan, password ngan; reject smoke/grafana password trung `POSTGRES_PASSWORD`.
- Tieu chi hoan thanh: Env hop le pass; optional smoke password placeholder fail; optional smoke token ngan fail; Grafana password trung database fail; regression/build pass.
- Cach kiem tra: Positive/negative `node scripts/validate-production-env.js` voi process env tam; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-029 - Make backups restoreable over existing schemas

- Muc tieu: Dam bao backup moi co the dung cho rollback/restore vao database hien huu sau khi da xac nhan thao tac pha huy.
- File lien quan: `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `docs/BACKUP_RESTORE.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `pg_dump --clean --if-exists`; ghi `dumpFormat` va `pgDumpArgs` vao manifest; restore dry-run canh bao neu backup legacy khong co cleanup metadata; cap nhat runbook.
- Tieu chi hoan thanh: Backup moi co manifest dump format; restore dry-run verify manifest; SQL dump moi co cleanup statements; legacy backup van duoc chap nhan kem warning.
- Cach kiem tra: `npm run prod:backup`; `npm run prod:restore -- -BackupPath <backup-moi> -DryRun`; inspect manifest/dump; regression/build.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-030 - Run security audit inside production deploy workflow

- Muc tieu: Dam bao deploy thu cong khong bo qua security audit gate da co trong CI.
- File lien quan: `scripts/deploy-production.ps1`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `-SkipSecurityAudit`; dua security audit vao danh sach safety gates can `-ConfirmSkipGates`; chay `npm run security:audit` sau env/compose validation va truoc smoke credential/migration/backup/deploy; cap nhat docs.
- Tieu chi hoan thanh: Dry-run mac dinh thuc thi security audit; skip security audit thieu confirm fail som; skip co confirm pass qua dry-run validation; regression/build pass.
- Cach kiem tra: Deploy dry-run voi env tam hop le; deploy dry-run `-SkipSecurityAudit` negative/positive; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-031 - Avoid PowerShell text pipelines for database backup and restore

- Muc tieu: Giam rui ro corrupt SQL dump/restore do PowerShell text stream re-encoding voi dump lon hoac du lieu unicode/escape phuc tap.
- File lien quan: `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `docs/BACKUP_RESTORE.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Cho `pg_dump` ghi file trong database container roi `docker cp` ra host; khi restore copy SQL vao target DB container va chay `psql -f`; cleanup temp file trong container bang `finally`; cap nhat runbook.
- Tieu chi hoan thanh: Backup moi tao duoc manifest va dump hop le; restore dry-run verify backup; khong con `pg_dump | Out-File` hay `Get-Content dump | docker exec psql`; regression/build pass.
- Cach kiem tra: `npm run prod:backup`; `npm run prod:restore -- -BackupPath <backup-moi> -DryRun`; `rg "Out-File|Get-Content .*psql"` tren scripts; regression/build.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-032 - Align production runbooks with safe deploy workflow

- Muc tieu: Khong de docs huong dan deploy thu cong bo qua preflight hoac in resolved compose secrets.
- File lien quan: `README.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Doi README production quick command sang `npm run prod:deploy`; ghi ro direct compose up chi dung cho manual recovery; trong runbook phu doi compose validation sang `npm run prod:config`; them `prod:env:check`, `security:audit`, `migrate:preflight`, backup vao manual equivalent dung thu tu.
- Tieu chi hoan thanh: Khong con huong dan `docker compose ... config` khong quiet trong docs production; docs uu tien deploy script va liet ke gate an toan.
- Cach kiem tra: `rg "docker compose .* config" README.md docs`; `npm run test:quality`; `npm run security:audit`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-033 - Prevent backup directory collisions

- Muc tieu: Tranh ghi de hoac tron file khi hai backup tao cung timestamp hoac target backup da ton tai.
- File lien quan: `scripts/backup-production.ps1`, `docs/BACKUP_RESTORE.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Doi timestamp backup sang `yyyyMMdd-HHmmss-fff`; chi tao parent `BackupDir` voi `-Force`; tao target backup va `product-uploads` khong overwrite; cap nhat runbook output path.
- Tieu chi hoan thanh: Backup moi tao duong dan co millisecond; target backup khong dung `New-Item -Force`; backup/dry-run restore pass; regression/build pass.
- Cach kiem tra: `npm run prod:backup`; `npm run prod:restore -- -BackupPath <backup-moi> -DryRun`; inspect script/docs; regression/build.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-034 - Mark completed backups and reject partial backup restores

- Muc tieu: Tranh restore nham thu muc backup partial khi backup loi giua chung.
- File lien quan: `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `docs/BACKUP_RESTORE.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Ghi `manifest.json` ngay luc bat dau voi `status=IN_PROGRESS`; cap nhat manifest trong qua trinh backup; doi sang `status=COMPLETED` va `completedAt` khi backup xong; restore reject manifest co status khac `COMPLETED`; legacy manifest khong status van warning.
- Tieu chi hoan thanh: Backup moi co manifest `COMPLETED`; restore dry-run pass voi backup moi; restore dry-run fail voi manifest `IN_PROGRESS`; regression/build pass.
- Cach kiem tra: `npm run prod:backup`; inspect manifest; restore dry-run positive/negative; regression/build.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-035 - Harden production log scan with container state checks

- Muc tieu: Khong de post-deploy log scan pass khi core container dang restart, unhealthy, OOM-killed, hoac restart count bat thuong.
- File lien quan: `scripts/production-log-check.js`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Doi inspect container sang JSON; fail neu container missing/stopped/restarting/dead/OOMKilled/unhealthy; them threshold `LOG_CHECK_MAX_RESTARTS`; in health/restart count khi pass; cap nhat docs.
- Tieu chi hoan thanh: `npm run prod:logs:check` pass tren stack sach va hien thi health/restart count; fail voi container thieu; regression/build pass.
- Cach kiem tra: `npm run prod:logs:check`; `LOG_CHECK_CONTAINERS=missing-container npm run prod:logs:check`; regression/build.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-036 - Retry post-deploy health checks

- Muc tieu: Giam fail gia khi `docker compose up -d` tra ve truoc khi frontend/gateway/services san sang.
- File lien quan: `scripts/health-check.js`, `scripts/deploy-production.ps1`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them retry vao `health-check` bang `HEALTH_CHECK_RETRIES` va `HEALTH_CHECK_RETRY_DELAY_MS`; deploy script dat default 30 lan, delay 5s neu operator chua set; cap nhat docs.
- Tieu chi hoan thanh: Health check pass tren stack hien tai; health check fail voi URL sai sau so lan retry cau hinh; deploy dry-run van khong mutate; regression/build pass.
- Cach kiem tra: `npm run health:check`; negative `HEALTH_CHECK_RETRIES=2`; deploy dry-run voi env tam; regression/build.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-037 - Fail fast on invalid frontend runtime API URL

- Muc tieu: Khong de frontend production am tham fallback ve localhost khi container thieu hoac sai `NEXT_PUBLIC_API_URL`.
- File lien quan: `frontend/app/api/runtime-config/route.ts`, `frontend/lib/api.ts`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Validate runtime API URL la absolute `http(s)` URL; trong production khong fallback localhost neu env thieu; client API config throw loi ro rang neu runtime/build config invalid; dev van giu fallback localhost.
- Tieu chi hoan thanh: Runtime config hop le tra JS 200; build frontend pass; regression pass.
- Cach kiem tra: `npm --workspace frontend run build`; `npm run test:regression`; `npm run health:check`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-038 - Verify frontend runtime config in health checks

- Muc tieu: Dam bao post-deploy health check bat loi `/api/runtime-config` hong hoac frontend runtime API URL sai.
- File lien quan: `scripts/health-check.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Health check fetch `/api/runtime-config`; verify content type JavaScript, parse `window.__WMS_CONFIG__`, reject error/empty apiUrl; neu `API_URL` duoc set thi so sanh runtime `apiUrl` voi API verification URL.
- Tieu chi hoan thanh: `npm run health:check` pass tren stack hien tai; negative mismatch voi `API_URL` sai fail; regression/build pass.
- Cach kiem tra: `npm run health:check`; `API_URL=<sai> HEALTH_CHECK_RETRIES=1 npm run health:check`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-039 - Enforce HTTPS frontend runtime API URL in production

- Muc tieu: Bao ve frontend runtime/client neu deploy preflight bi bo qua va `NEXT_PUBLIC_API_URL` production la HTTP public URL.
- File lien quan: `frontend/app/api/runtime-config/route.ts`, `frontend/lib/api.ts`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Runtime config reject non-HTTPS URL trong production tru khi `ALLOW_LOCAL_PRODUCTION_URLS=true`; client API helper cung reject HTTP production trong browser; giu server prerender/dev fallback.
- Tieu chi hoan thanh: Build frontend pass; route/client van chap nhan local dev; production runtime HTTP se tra error JS/500.
- Cach kiem tra: `npm --workspace frontend run build`; `npm run test:regression`; `npm run health:check`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-040 - Add static quality guards for production invariants

- Muc tieu: Bien cac invariant production quan trong thanh quality gate lap lai duoc, tranh regression am tham khi sua runtime config, deploy workflow, log scan, backup/restore.
- File lien quan: `scripts/static-quality-check.js`, `frontend/app/api/runtime-config/route.ts`, `frontend/lib/api.ts`, `scripts/health-check.js`, `scripts/deploy-production.ps1`, `scripts/production-log-check.js`, `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them static assertions cho runtime config no-store/force-dynamic, browser config object, HTTPS production guard, health check runtime config, deploy security audit/quiet compose/skip confirmation, log scan container state, backup status manifest va restore checksum/confirmation.
- Tieu chi hoan thanh: `npm run test:quality` fail neu guard production chinh bi go bo; regression/build/security/health/log checks van pass.
- Cach kiem tra: `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`; `npm run health:check`; `npm run prod:logs:check`; `npm run security:audit`; `git diff --check`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-041 - Add production readiness audit command

- Muc tieu: Co mot gate tinh, khong mutate du lieu, de audit nhanh trang thai production readiness truoc khi operator co credential deploy that.
- File lien quan: `scripts/production-readiness-audit.js`, `package.json`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Kiem tra task list khong con TODO/IN_PROGRESS, chi T-004 duoc BLOCKED; xac minh cac npm scripts deploy/security/backup/restore/log/observability ton tai; xac minh compose config scripts dung `config --quiet`; xac minh artifact PDF/runtime config/deploy/log/backup/restore/proxy ton tai; xac minh runbook chinh co lenh deploy/backup/restore an toan; wire audit vao `npm run test:quality`.
- Tieu chi hoan thanh: `npm run prod:readiness:audit` va `npm run test:quality` pass khi cac gate non-deploy day du va fail ro neu checklist/script/runbook thieu invariant production quan trong.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`; `npm run health:check`; `npm run prod:logs:check`; `npm run security:audit`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-042 - Remove local admin emails from production env template

- Muc tieu: Tranh operator copy `.env.production.example` voi email `@wms.local` vao deploy production, dong thoi giu audit lap lai de template khong regression.
- File lien quan: `.env.production.example`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Doi `BOOTSTRAP_ADMIN_EMAIL` va `SMOKE_ADMIN_EMAIL` sang placeholder production ro rang; them readiness audit check cac key env production quan trong va fail neu email local xuat hien trong template.
- Tieu chi hoan thanh: Template khong con `admin@wms.local`; `npm run prod:readiness:audit` fail neu template quay lai email local hoac thieu env key quan trong.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-043 - Require production public URLs at compose layer

- Muc tieu: Ngăn production compose fallback về localhost nếu operator bypass env validator hoặc chạy compose trực tiếp.
- File lien quan: `docker-compose.prod.yml`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Đổi `NEXT_PUBLIC_API_URL` và `PRODUCT_PUBLIC_BASE_URL` trong production overlay từ default localhost sang required compose substitution; thêm readiness audit guard để fail nếu localhost default quay lại.
- Tieu chi hoan thanh: Production compose fail sớm khi thiếu public URL; compose config pass với env hợp lệ; readiness audit bắt regression localhost default.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; `docker compose --env-file <env-hop-le> -f docker-compose.yml -f docker-compose.prod.yml config --quiet`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-044 - Require explicit production PostgreSQL user

- Muc tieu: Ngăn production deploy/backup/restore âm thầm dùng role PostgreSQL mặc định `postgres`.
- File lien quan: `scripts/validate-production-env.js`, `docker-compose.prod.yml`, `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `scripts/production-readiness-audit.js`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Bắt buộc `POSTGRES_USER` trong env validator; đổi production compose từ fallback `postgres` sang required substitution; backup/restore fail sớm nếu thiếu `POSTGRES_USER`; thêm readiness audit guard và cập nhật runbook.
- Tieu chi hoan thanh: Env validation fail nếu thiếu hoặc dùng `POSTGRES_USER=postgres`; production compose fail nếu thiếu `POSTGRES_USER`; backup/restore không fallback `postgres`.
- Cach kiem tra: `npm run prod:readiness:audit`; env validator positive/negative với `POSTGRES_USER`; compose config positive/negative; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-045 - Add npm shortcut for production deploy dry-run

- Muc tieu: Cho operator mot lenh ngan, ro rang de preview workflow deploy production truoc khi cham vao server.
- File lien quan: `package.json`, `scripts/production-readiness-audit.js`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `npm run prod:deploy:dry-run` goi `scripts/deploy-production.ps1 -DryRun`; cap nhat runbook dung shortcut nay; them readiness audit guard de script dry-run khong bi go bo.
- Tieu chi hoan thanh: Dry-run deploy voi env production tam hop le pass qua env validation, compose config va security audit ma khong mutate stack; readiness audit xac minh script/docs ton tai.
- Cach kiem tra: `npm run prod:deploy:dry-run -- -EnvFile <env-hop-le> -SkipBackup -SkipMigratePreflight -SkipSmoke -SkipLogCheck -NoBuild -ConfirmSkipGates`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-046 - Add standalone production verification workflow

- Muc tieu: Cho phep xac minh production da deploy bang mot lenh rieng, khong mutate stack, ke ca khi deploy duoc thuc hien thu cong hoac tu CI/CD khac.
- File lien quan: `scripts/verify-production.ps1`, `package.json`, `scripts/production-readiness-audit.js`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `scripts/verify-production.ps1` load env production, derive `API_URL`/`FRONTEND_URL`, validate env, chay security audit, health, smoke, observability optional va log scan; them `npm run prod:verify`; cap nhat docs va readiness audit.
- Tieu chi hoan thanh: Verify workflow dry-run pass voi env tam hop le va khong mutate stack; skip security/health/smoke/log can `-ConfirmSkipGates`; readiness audit xac minh command/docs/script ton tai.
- Cach kiem tra: `npm run prod:verify -- -EnvFile <env-hop-le> -DryRun -SkipSmoke -SkipLogCheck -ConfirmSkipGates`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-047 - Do not default required product public URL in workflows

- Muc tieu: Dam bao deploy/verify preflight fail neu `.env.production` thieu `PRODUCT_PUBLIC_BASE_URL`, thay vi tu suy ra tu `NEXT_PUBLIC_API_URL` va che lap loi cau hinh.
- File lien quan: `scripts/deploy-production.ps1`, `scripts/verify-production.ps1`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Bo `Set-DefaultProcessEnv` cho `PRODUCT_PUBLIC_BASE_URL` trong deploy va verify workflows; them readiness audit guard de khong default lai bien required nay.
- Tieu chi hoan thanh: Deploy dry-run va verify dry-run fail som khi env thieu `PRODUCT_PUBLIC_BASE_URL`; pass voi env hop le; readiness audit bat regression.
- Cach kiem tra: `npm run prod:deploy:dry-run -- -EnvFile <env-thieu-product-url> -SkipBackup -SkipMigratePreflight -SkipSmoke -SkipLogCheck -NoBuild -ConfirmSkipGates`; `npm run prod:verify -- -EnvFile <env-thieu-product-url> -DryRun -SkipSmoke -SkipLogCheck -ConfirmSkipGates`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-048 - Check infrastructure container state in production log gate

- Muc tieu: Khong de post-deploy log gate pass khi database, Redis, hoac RabbitMQ container dang dung/restart/unhealthy/OOM-killed.
- File lien quan: `scripts/production-log-check.js`, `scripts/production-readiness-audit.js`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Tach log-scan containers va state-check containers; giu scan log nghiem trong cho app containers; them DB/Redis/RabbitMQ vao state checks mac dinh qua `LOG_CHECK_STATE_CONTAINERS`; cap nhat docs va readiness audit.
- Tieu chi hoan thanh: `npm run prod:logs:check` in trang thai app va infra containers; fail neu infra container missing/stopped/restarting/dead/unhealthy/OOMKilled hoac restart count vuot nguong.
- Cach kiem tra: `npm run prod:logs:check`; `LOG_CHECK_STATE_CONTAINERS=missing-container npm run prod:logs:check`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-049 - Reject restore when backup PostgreSQL role differs

- Muc tieu: Tranh rollback/restore bang `POSTGRES_USER` khac role da dung de tao backup, gay loi owner/permission hoac restore sai giua chung.
- File lien quan: `scripts/restore-production.ps1`, `scripts/production-readiness-audit.js`, `docs/BACKUP_RESTORE.md`, `docs/rollback-plan.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: So sanh `manifest.postgresUser` voi target `POSTGRES_USER`; refuse restore neu khac; warning cho legacy manifest thieu `postgresUser`; cap nhat runbook va readiness audit.
- Tieu chi hoan thanh: Restore dry-run fail truoc khi doc SQL/container khi manifest `postgresUser` khac target; legacy manifest thieu field van warning; audit bat guard nay neu bi go bo.
- Cach kiem tra: Tao manifest tam mismatch va chay `restore-production.ps1 -DryRun`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-050 - Add HSTS to bundled TLS proxy

- Muc tieu: Tang baseline bao mat cho internet-facing Caddy reverse proxy bang HSTS khi dung TLS proxy bundled.
- File lien quan: `ops/caddy/Caddyfile`, `scripts/production-readiness-audit.js`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `Strict-Transport-Security "max-age=31536000"` cho frontend va API proxy host; them readiness audit guard; cap nhat docs ve security headers proxy.
- Tieu chi hoan thanh: Caddyfile co HSTS cho ca frontend/API host; proxy compose config render pass; readiness/quality pass.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; `npm run prod:proxy:config` voi env hop le; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-014 - Add optional TLS reverse proxy overlay

- Mục tiêu: Có cấu hình TLS/reverse proxy chạy được cho deploy internet-facing, không chỉ ghi chú trong docs.
- File liên quan: `docker-compose.proxy.yml`, `ops/caddy/Caddyfile`, `.env.production.example`, `scripts/deploy-production.ps1`, `package.json`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`.
- Các bước thực hiện: Thêm Caddy profile publish `80/443`; reverse proxy `PUBLIC_FRONTEND_HOST` tới frontend và `PUBLIC_API_HOST` tới gateway; reset host ports của frontend/gateway khi proxy bật; thêm `-WithProxy` cho deploy script; thêm `prod:proxy:config`; validate proxy host khớp public URL và `ACME_EMAIL`; cập nhật env example/docs.
- Tiêu chí hoàn thành: Compose proxy config render được với env hợp lệ, dry-run deploy in đúng compose overlay/profile, validator fail khi proxy host mismatch hoặc sai định dạng, không ảnh hưởng prod compose mặc định khi không bật proxy.
- Cách kiểm tra: `npm run prod:proxy:config` với env tạm hợp lệ, `deploy-production.ps1 -DryRun -WithProxy`.
- Trạng thái: DONE.
- Mức ưu tiên: P1.

### T-051 - Wait for Redis health before service startup

- Muc tieu: Tranh services start khi Redis container moi chi started nhung chua san sang nhan ket noi.
- File lien quan: `docker-compose.yml`, `scripts/production-readiness-audit.js`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them Redis healthcheck `redis-cli ping`; doi cac `depends_on.redis.condition` sang `service_healthy`; them readiness audit guard va cap nhat docs.
- Tieu chi hoan thanh: Compose config pass; services doi Redis healthy nhu RabbitMQ/Postgres; readiness audit fail neu quay lai `service_started`.
- Cach kiem tra: `docker compose config --quiet`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`; `npm run health:check`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-052 - Harden Docker build context ignores

- Muc tieu: Giam rui ro Docker build context vo tinh gom env secret, local logs, IDE metadata, coverage/build output, backup hoac upload artifact.
- File lien quan: `frontend/.dockerignore`, `services/*/.dockerignore`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Chuan hoa `.dockerignore` cho frontend va tat ca service contexts; them `.env`, `.env.*`, `*.log`, IDE metadata, backups/tmp artifacts; them `uploads` cho product-service; them readiness audit guard cho cac pattern bat buoc.
- Tieu chi hoan thanh: Tat ca Docker contexts ignore env/log/local artifact patterns; readiness audit fail neu context thieu `.dockerignore` hoac thieu pattern quan trong.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; `docker compose config --quiet`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-053 - Make production env-file loading deterministic

- Muc tieu: Tranh deploy/verify/backup/restore dung nham bien moi truong cu trong shell thay vi file env production duoc chi dinh.
- File lien quan: `scripts/deploy-production.ps1`, `scripts/verify-production.ps1`, `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Cho env file override process env trong workflow production; derive lai `API_URL`, `WMS_API_URL`, `FRONTEND_URL` tu env file trong deploy/verify; cho validator uu tien `PRODUCTION_ENV_FILE`; them readiness audit guard.
- Tieu chi hoan thanh: Dry-run deploy/verify dung URL va secret trong env file duoc chi dinh, khong bi process env cu che lap; readiness audit bat regression.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; dry-run deploy/verify voi env tam co process env sai; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-054 - Honor local production URL override from env file

- Muc tieu: Dam bao `ALLOW_LOCAL_PRODUCTION_URLS=true` trong env file duoc validator ton trong khi chay local production-like preflight.
- File lien quan: `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Doi validator doc `ALLOW_LOCAL_PRODUCTION_URLS` sau khi load env file; them readiness audit guard de khong doc flag qua som; kiem tra positive/negative voi env tam localhost.
- Tieu chi hoan thanh: Env tam localhost pass khi file co `ALLOW_LOCAL_PRODUCTION_URLS=true` va fail khi khong co flag; production public URL validation van giu nguyen.
- Cach kiem tra: `PRODUCTION_ENV_FILE=<env-localhost> node scripts/validate-production-env.js`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-055 - Reject env files missing required keys even with stale shell env

- Muc tieu: Dam bao production env validation khong pass khi env file thieu key bat buoc nhung shell hien tai co san gia tri cu.
- File lien quan: `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Clear cac production env keys duoc validator quan ly truoc khi load env file; giu fallback process env chi khi env file khong ton tai; them readiness audit guard.
- Tieu chi hoan thanh: Env file thieu `PRODUCT_PUBLIC_BASE_URL` fail ke ca khi process env co gia tri stale; env file day du van pass; process-env-only mode van ho tro khi khong co env file.
- Cach kiem tra: `PRODUCTION_ENV_FILE=<env-thieu-key> PRODUCT_PUBLIC_BASE_URL=<stale> node scripts/validate-production-env.js`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-056 - Clear stale managed env in production PowerShell workflows

- Muc tieu: Tranh deploy/verify/backup/restore dung nham smoke token, URL, PostgreSQL user, hoac DB name cu tu shell khi env file duoc chi dinh nhung thieu key do.
- File lien quan: `scripts/deploy-production.ps1`, `scripts/verify-production.ps1`, `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Clear cac managed env keys trong process truoc khi import env file; deploy/verify clear smoke credentials va derived URLs; backup/restore clear PostgreSQL user va DB names; them readiness audit guard.
- Tieu chi hoan thanh: Deploy/verify dry-run khong pass smoke credential check neu env file thieu smoke credential du process env co stale token; backup/restore khong dung stale `POSTGRES_USER` khi env file ton tai nhung thieu key.
- Cach kiem tra: Dry-run deploy/verify voi env file thieu smoke credential va process env co stale token; backup/restore negative voi env file thieu `POSTGRES_USER`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-057 - Fail backup before creating local artifacts when config is invalid

- Muc tieu: Tranh tao thu muc backup rong/partial artifact khi production backup bi sai cau hinh co ban.
- File lien quan: `scripts/backup-production.ps1`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Tach import env file thanh helper; validate `POSTGRES_USER` truoc khi tao `BackupDir`, target timestamp, hoac manifest; them readiness audit guard.
- Tieu chi hoan thanh: Backup voi env file thieu `POSTGRES_USER` fail ma khong tao thu muc backup moi; backup hop le van tao manifest `IN_PROGRESS` roi `COMPLETED` nhu cu.
- Cach kiem tra: Chay `backup-production.ps1` voi temp `BackupDir` va env file thieu `POSTGRES_USER`; xac minh temp `BackupDir` khong ton tai; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-058 - Mark failed backups explicitly in manifest

- Muc tieu: Khi backup fail giua chung, manifest phai ghi ro `FAILED`, thoi gian fail va ly do de operator khong nham lan voi backup dang chay.
- File lien quan: `scripts/backup-production.ps1`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `failedAt` va `error` vao manifest; wrap backup DB/upload trong `try/catch`; khi loi, ghi `status = "FAILED"` roi rethrow; giu restore reject moi status khac `COMPLETED`.
- Tieu chi hoan thanh: Loi `pg_dump`/`docker cp` de lai manifest `FAILED` co error; backup thanh cong van `COMPLETED`; restore van reject backup failed.
- Cach kiem tra: Chay backup voi fake `docker` tra loi va inspect manifest; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-059 - Treat product upload backup failure as backup failure

- Muc tieu: Khong de backup production hoan tat thanh cong khi product upload volume khong copy duoc.
- File lien quan: `scripts/backup-production.ps1`, `scripts/production-readiness-audit.js`, `docs/BACKUP_RESTORE.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Bo nhanh silently skip product uploads; neu `docker cp` upload fail thi throw vao outer backup failure handler; cap nhat runbook va readiness audit guard.
- Tieu chi hoan thanh: Loi copy `/app/uploads/products` tao manifest `FAILED`; manifest `COMPLETED` chi co khi DB dumps va product uploads deu thanh cong.
- Cach kiem tra: Chay backup voi fake `docker` cho DB dump pass nhung product upload copy fail; inspect manifest `FAILED`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-060 - Validate product upload backup checksums during restore

- Muc tieu: Phat hien product upload backup bi thieu/hong truoc khi restore destructively.
- File lien quan: `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `scripts/production-readiness-audit.js`, `docs/BACKUP_RESTORE.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Ghi `files[]` gom relative path, bytes, SHA256 cho product uploads; restore validate upload directory, count, bytes, per-file hash va path safety; legacy manifest khong co file hashes van warning.
- Tieu chi hoan thanh: Restore dry-run fail khi product upload file bi sua/xoa hoac manifest co path khong an toan; backup moi co checksum tung file upload.
- Cach kiem tra: Tao backup fixture tam voi upload checksum hop le roi dry-run pass; sua file upload va dry-run fail; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-061 - Fail restore when product upload copy fails

- Muc tieu: Khong bao restore thanh cong neu tao thu muc upload hoac copy product uploads vao container that bai.
- File lien quan: `scripts/restore-production.ps1`, `scripts/production-readiness-audit.js`, `docs/BACKUP_RESTORE.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Kiem tra `$LASTEXITCODE` sau `docker exec wms-product-service mkdir -p /app/uploads/products` va sau `docker cp` product uploads; cap nhat runbook va readiness audit guard.
- Tieu chi hoan thanh: Restore co `product-uploads/` fail neu mkdir/copy uploads tra non-zero; khong in thanh cong gia sau loi copy uploads.
- Cach kiem tra: Chay restore fixture voi fake `docker` cho DB restore pass nhung upload copy fail; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-062 - Keep product upload directory consistent across compose, backup, and restore

- Muc tieu: Tranh mat product uploads khi production operator doi `PRODUCT_UPLOAD_DIR` nhung volume/backup/restore van hard-code path cu.
- File lien quan: `docker-compose.prod.yml`, `scripts/validate-production-env.js`, `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `scripts/production-readiness-audit.js`, `docs/BACKUP_RESTORE.md`, `docs/DEPLOYMENT.md`, `docs/PRODUCTION_NOTES.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Mount `product-upload-data` vao `${PRODUCT_UPLOAD_DIR:-/app/uploads/products}`; backup va restore doc `PRODUCT_UPLOAD_DIR` tu env file; validator chi cho absolute Linux container path an toan; cap nhat docs va readiness audit.
- Tieu chi hoan thanh: Compose production, Product Service env, backup source va restore destination dung cung upload dir; env path sai fail validation; default van `/app/uploads/products`.
- Cach kiem tra: Env validator positive/negative cho `PRODUCT_UPLOAD_DIR`; compose config voi custom upload dir; fake docker backup/restore verify path; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-063 - Guard Vietnamese PDF text from mojibake regressions

- Muc tieu: Dam bao PDF phieu nhap/xuat va smoke data giu tieng Viet co dau doc duoc, khong quay lai chuoi mojibake.
- File lien quan: `services/transaction-service/src/transaction.service.ts`, `services/transaction-service/src/transaction-pdf.renderer.ts`, `scripts/smoke-test.js`, `scripts/static-quality-check.js`, `scripts/transaction-regression-test.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Sua cac literal PDF/smoke bi mojibake; mo rong static quality check bat cac ky tu mojibake pho bien; them guard cho title PDF, chu ky PDF, unit smoke tieng Viet va HTML/Puppeteer renderer.
- Tieu chi hoan thanh: Khong con mau mojibake trong source production text; static quality va transaction regression fail neu chuoi PDF tieng Viet hoac renderer HTML bi regression.
- Cach kiem tra: Chay mojibake scan cua `scripts/static-quality-check.js`; `npm run test:quality`; `npm run test:transactions`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-064 - Reject mismatched inbound/outbound PDF routes

- Muc tieu: Khong de `/inbounds/:id/pdf` render phieu xuat hoac `/outbounds/:id/pdf` render phieu nhap khi id hop le nhung sai loai chung tu.
- File lien quan: `services/transaction-service/src/app.controller.ts`, `services/transaction-service/src/transaction.service.ts`, `scripts/smoke-test.js`, `scripts/transaction-regression-test.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Truyen expected transaction type tu controller vao `pdfFile`; kiem tra type ngay sau `getTransaction` va truoc enrichment/render; tra `404 NotFoundException` cho route sai loai; them smoke/regression guard.
- Tieu chi hoan thanh: PDF route dung loai van tra PDF; invalid UUID van 400; valid id nhung sai route loai phieu tra 404 va khong render sai filename/chung tu.
- Cach kiem tra: `npm run test:transactions`; rebuild transaction-service neu smoke runtime dang chay bang container; `npm run smoke:test`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-065 - Keep local compose internal gateway token consistent after recreate

- Muc tieu: Dam bao local Docker Compose co the rebuild/recreate tung service ma khong lam gateway/backend mat dong bo `INTERNAL_GATEWAY_TOKEN`.
- File lien quan: `docker-compose.yml`, `scripts/static-quality-check.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them cung mot default dev-only `INTERNAL_GATEWAY_TOKEN` cho api-gateway va tat ca backend services; them static guard dem token trong compose; giu production compose tiep tuc require token that.
- Tieu chi hoan thanh: Recreate service local khong lam confirm transaction fail vi thieu token; static quality fail neu service nao mat env token.
- Cach kiem tra: `docker compose config --quiet`; recreate local core services; `npm run health:check`; `npm run smoke:test`; `npm run test:quality`; `npm run test:regression`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-066 - Add app healthchecks to base Docker Compose

- Muc tieu: Local compose sau rebuild/recreate phai expose Docker health state cho frontend, gateway va backend services, khong chi DB/Redis/RabbitMQ.
- File lien quan: `docker-compose.yml`, `scripts/static-quality-check.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them healthcheck endpoint cho frontend `/api/health`, gateway `/api/health/ready`, va cac service `/api/health`; them `start_period`; them static guard de base compose khong mat healthcheck app.
- Tieu chi hoan thanh: `docker compose ps` hien app containers co health state sau recreate; log/state scan co the fail neu app unhealthy; static quality fail neu base compose thieu healthchecks app.
- Cach kiem tra: `docker compose config --quiet`; recreate local app containers; `npm run health:check`; `LOG_CHECK_SINCE=1m npm run prod:logs:check`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-067 - Order frontend and gateway startup by service health

- Muc tieu: Sau khi base compose co app healthcheck, dung health state de giam startup degraded: frontend cho gateway ready, gateway cho backend services healthy.
- File lien quan: `docker-compose.yml`, `scripts/static-quality-check.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Doi frontend `depends_on` sang `api-gateway.condition=service_healthy`; them api-gateway depends_on cho auth/product/inventory/transaction/report service `service_healthy`; them static guard de khong regression.
- Tieu chi hoan thanh: Compose config hop le; recreate frontend/gateway khong start truoc cac dependency healthy; health/log/smoke van pass.
- Cach kiem tra: `docker compose config --quiet`; `docker compose up -d --no-build --force-recreate frontend`; `npm run health:check`; `LOG_CHECK_SINCE=1m npm run prod:logs:check`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-068 - Clear stale product upload dir in production workflows

- Muc tieu: Khong de shell env cu cua `PRODUCT_UPLOAD_DIR` anh huong deploy/verify khi env file production khong khai bao bien nay.
- File lien quan: `scripts/deploy-production.ps1`, `scripts/verify-production.ps1`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `PRODUCT_UPLOAD_DIR` vao managed keys duoc clear truoc khi load env file trong deploy/verify; them readiness audit guard cho hai workflow.
- Tieu chi hoan thanh: Env file la nguon su that cho product upload dir; stale process env khong lam compose deploy mount nham upload path; readiness audit fail neu workflow mat guard.
- Cach kiem tra: Dat process `PRODUCT_UPLOAD_DIR` stale roi chay deploy dry-run voi env file hop le khong khai bao upload dir; compose validation dung default `/app/uploads/products`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-069 - Clear optional production compose env before workflow validation

- Muc tieu: Dam bao shell env cu khong override env file production cho cac bien optional nhu DB names, ports, observability, internal service URLs, outbox tuning va local URL override.
- File lien quan: `scripts/deploy-production.ps1`, `scripts/verify-production.ps1`, `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Mo rong managed env keys trong deploy/verify; them `COMPOSE_OPTIONAL_KEYS` vao production env validator; them readiness audit guard cho cac nhom bien quan trong.
- Tieu chi hoan thanh: Env file la nguon su that cho production workflows; stale shell env khong the doi DB names, ports, upload dir, observability credential, outbox config, internal URLs hoac `ALLOW_LOCAL_PRODUCTION_URLS`.
- Cach kiem tra: Dat stale invalid `ALLOW_LOCAL_PRODUCTION_URLS=true`, `AUTH_DB`, `FRONTEND_PORT`, `GRAFANA_ADMIN_PASSWORD`, `TRANSACTION_OUTBOX_BATCH_SIZE`, `INVENTORY_API_URL` roi chay deploy/verify dry-run voi env file hop le; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-070 - Validate optional production env value formats

- Muc tieu: Chan cau hinh production optional sai dinh dang truoc khi compose/deploy, thay vi de service runtime loi muon.
- File lien quan: `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them validator integer/boolean/database name/duration/internal URL; ap dung cho ports, timeout, image size, outbox tuning, consumer prefetch, Prometheus retention va service URLs; them readiness audit guard.
- Tieu chi hoan thanh: Env file fail ro rang khi port khong phai so, DB name sai, boolean sai, URL noi bo khong hop le, hoac batch/timeout am; env hop le van pass.
- Cach kiem tra: Chay `node scripts/validate-production-env.js` voi env tam hop le va cac env tam loi cho `FRONTEND_PORT`, `AUTH_DB`, `TRANSACTION_OUTBOX_PUBLISHER_ENABLED`, `INVENTORY_API_URL`, `TRANSACTION_OUTBOX_BATCH_SIZE`; `npm run prod:readiness:audit`; `npm run test:quality`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-071 - Validate production host ports and observability bind host

- Muc tieu: Phat hien som cau hinh port/bind host production co the lam `docker compose up` fail hoac expose observability sai y do.
- File lien quan: `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them validator phat hien trung host port giua frontend/proxy/observability; validate `OBSERVABILITY_BIND_HOST` la bind host hop le; giu guard public bind can `OBSERVABILITY_EXPOSE_PUBLIC=true`.
- Tieu chi hoan thanh: Env hop le pass; env co `FRONTEND_PORT` trung `GRAFANA_PORT` fail; env co `OBSERVABILITY_BIND_HOST` kem scheme/path/port fail; public observability bind van fail neu chua xac nhan expose.
- Cach kiem tra: Chay `node scripts/validate-production-env.js` voi env tam hop le va cac env tam loi cho trung port, bind host sai, public bind khong co `OBSERVABILITY_EXPOSE_PUBLIC=true`; `npm run prod:readiness:audit`; `npm run test:quality`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-072 - Validate URL-safe production connection credentials

- Muc tieu: Tranh deploy production fail vi PostgreSQL/RabbitMQ username/password chua ky tu pha vo connection URL trong compose.
- File lien quan: `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them validator cho `POSTGRES_USER`, `POSTGRES_PASSWORD`, `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS` chi dung ky tu URL-safe unreserved; them readiness audit guard.
- Tieu chi hoan thanh: Env hop le pass; env co credential chua `@`, `:`, `/`, `#` fail som voi thong bao ro rang; validation secret yeu va placeholder van giu nguyen.
- Cach kiem tra: Chay `node scripts/validate-production-env.js` voi env tam hop le va env tam loi cho `POSTGRES_PASSWORD=bad@password-12345`; `npm run prod:readiness:audit`; `npm run test:quality`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-073 - Make production port validation profile-aware

- Muc tieu: Tranh false-positive khi validator chan port cua proxy/observability du cac compose profile do khong duoc cau hinh trong env.
- File lien quan: `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Chi dua `HTTP_PORT`/`HTTPS_PORT` vao collision check khi proxy settings duoc cau hinh; chi dua `PROMETHEUS_PORT`/`GRAFANA_PORT`/`LOKI_PORT` vao collision check khi observability settings duoc cau hinh; giu check trung port trong tung profile active.
- Tieu chi hoan thanh: Env khong cau hinh proxy/observability co the dung `FRONTEND_PORT=80`; proxy/observability ports chi bi check khi profile tuong ung active; env observability co `FRONTEND_PORT=9090` va `PROMETHEUS_PORT=9090` fail khi observability active.
- Cach kiem tra: Chay `node scripts/validate-production-env.js` voi env tam cho cac ca tren; `npm run prod:readiness:audit`; `npm run test:quality`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-074 - Reject embedded credentials in public production URLs

- Muc tieu: Khong cho secret bi nhung trong `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`, hoac `PRODUCT_PUBLIC_BASE_URL`, vi cac URL nay co the lo ra frontend/log/proxy config.
- File lien quan: `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them guard trong `validatePublicUrl` de fail neu URL co username/password; them readiness audit guard.
- Tieu chi hoan thanh: Env hop le pass; env co `NEXT_PUBLIC_API_URL=https://user:pass@example.com/api` fail som; validation HTTPS/public host van giu nguyen.
- Cach kiem tra: Chay `node scripts/validate-production-env.js` voi env tam hop le va env tam URL co credential; `npm run prod:readiness:audit`; `npm run test:quality`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-075 - Make port validation use active deploy profiles

- Muc tieu: Tranh false-positive khi proxy overlay reset `frontend.ports` nhung validator van tinh `FRONTEND_PORT` la host port active trong workflow `-WithProxy`.
- File lien quan: `scripts/validate-production-env.js`, `scripts/deploy-production.ps1`, `scripts/verify-production.ps1`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Truyen `PRODUCTION_COMPOSE_PROFILES` tu deploy/verify workflow vao env validator; validator dung profile active de quyet dinh frontend/proxy/observability host ports nao can collision check; them readiness audit guard.
- Tieu chi hoan thanh: Deploy dry-run `-WithProxy` pass khi `FRONTEND_PORT=80` va `HTTP_PORT=80` vi frontend port da bi reset; deploy dry-run khong `-WithProxy` van fail neu `FRONTEND_PORT` trung observability port active; proxy/observability profile active van bat trung port noi bo.
- Cach kiem tra: Chay `prod:deploy:dry-run` voi env tam co proxy va duplicate frontend/http port; chay negative env tam co duplicate active proxy port hoac observability port; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-076 - Validate active production compose profile names and requirements

- Muc tieu: Khong de `PRODUCTION_COMPOSE_PROFILES` sai hoac thieu config bat buoc lam workflow deploy/verify loi muon o compose config.
- File lien quan: `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Validate profile chi gom `none`, `proxy`, `observability`; cam duplicate va cam `none` di kem profile khac; khi `proxy` active thi bat buoc public proxy host/email; khi `observability` active thi bat buoc `GRAFANA_ADMIN_PASSWORD`.
- Tieu chi hoan thanh: Env hop le pass; profile sai fail; `proxy` active thieu `PUBLIC_FRONTEND_HOST`/`PUBLIC_API_HOST`/`ACME_EMAIL` fail; `observability` active thieu `GRAFANA_ADMIN_PASSWORD` fail.
- Cach kiem tra: Chay `node scripts/validate-production-env.js` voi env tam cho cac ca positive/negative tren; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-077 - Clear stale active compose profiles during env validation

- Muc tieu: Dam bao `PRODUCTION_ENV_FILE` van la nguon su that khi shell co san `PRODUCTION_COMPOSE_PROFILES` cu.
- File lien quan: `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `PRODUCTION_COMPOSE_PROFILES` vao managed env keys cua validator; them readiness audit guard.
- Tieu chi hoan thanh: Env file khong khai bao profile van pass du shell co stale `PRODUCTION_COMPOSE_PROFILES=bad`; env file khai bao profile sai van fail.
- Cach kiem tra: Chay `node scripts/validate-production-env.js` voi env tam hop le va process env stale profile sai; chay env tam co profile sai that; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-078 - Document URL-safe production connection credentials

- Muc tieu: Lam docs/env example khop voi validator URL-safe credential, tranh operator tao PostgreSQL/RabbitMQ password co ky tu pha vo connection URL.
- File lien quan: `.env.production.example`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them comment vao env example; cap nhat deployment runbooks; them readiness audit guard.
- Tieu chi hoan thanh: Docs noi ro `POSTGRES_USER`, `POSTGRES_PASSWORD`, `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS` chi dung letters/numbers/dot/underscore/tilde/hyphen; readiness audit fail neu thieu huong dan nay.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-079 - Reject query and hash in public production base URLs

- Muc tieu: Dam bao `NEXT_PUBLIC_API_URL` va `PRODUCT_PUBLIC_BASE_URL` la base URL sach, khong co query/hash lam hong path join hoac lo config ra frontend/log.
- File lien quan: `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them guard cho public URL reject query string va hash fragment; cap nhat runbook; them readiness audit guard.
- Tieu chi hoan thanh: Env hop le pass; `NEXT_PUBLIC_API_URL=https://api.example.com/api?x=1` fail; `PRODUCT_PUBLIC_BASE_URL=https://api.example.com/api#frag` fail; `CORS_ORIGIN` van chi chap nhan origin.
- Cach kiem tra: Chay `node scripts/validate-production-env.js` voi env tam hop le va env tam URL co query/hash; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-080 - Redact environment-provided demo seed password

- Muc tieu: Khong in `DEMO_ADMIN_PASSWORD` hoac `BOOTSTRAP_ADMIN_PASSWORD` ra console khi chay seed demo, tranh lo secret trong terminal/CI logs.
- File lien quan: `scripts/seed-demo-data.js`, `scripts/static-quality-check.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Theo doi password co den tu env hay default demo; chi in default demo password; redacted password neu load tu env; them static quality guard.
- Tieu chi hoan thanh: Seed demo van thong bao account local mac dinh; khi password den tu env thi output hien `[redacted: loaded from environment]`; static quality fail neu guard bi go.
- Cach kiem tra: `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-081 - Make production migration preflight compose-network aware

- Muc tieu: Dam bao deploy production chay migration preflight duoc voi stack Docker Compose that, khong can host resolve duoc service DNS noi bo va khong tao DATABASE_URL chua password tren command line.
- File lien quan: `scripts/migrate.js`, `scripts/production-migration-preflight.js`, `scripts/deploy-production.ps1`, `package.json`, `scripts/production-readiness-audit.js`, `docs/production-deployment.md`, `docs/DEPLOYMENT.md`, `docs/MIGRATIONS.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Export `preflightChecks` tu migration runner hien co; them production preflight script dung `docker compose exec -T <db-service> psql`; validate DB services dang running; dung `POSTGRES_USER` va DB names tu env file; doi deploy workflow sang script production; them npm script, docs va readiness audit guard.
- Tieu chi hoan thanh: Deploy workflow khong goi `npm run migrate:preflight` host-only nua; production preflight doc data qua DB containers dang chay; neu DB services chua running thi fail ro rang va huong dan first deploy dung `-SkipMigratePreflight -ConfirmSkipGates`; khong in secret ra log.
- Cach kiem tra: `npm run prod:migrate:preflight -- --help`; `npm run prod:deploy:dry-run -- -EnvFile <env-hop-le> -SkipBackup -SkipMigratePreflight -SkipSmoke -SkipLogCheck -NoBuild -ConfirmSkipGates`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-082 - Add CI smoke coverage for production migration preflight

- Muc tieu: Dam bao production migration preflight moi duoc chay trong CI tren stack Docker dang running, tranh regression ve service names, compose env interpolation hoac `docker compose exec psql`.
- File lien quan: `.github/workflows/ci.yml`, `docs/migration-guide.md`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them CI step sau gateway readiness de tao env preflight tam va chay `npm run prod:migrate:preflight -- --env-file .env.ci-preflight`; cap nhat migration guide phan biet `migrate:preflight` host DB URL va `prod:migrate:preflight` Compose-aware; them readiness audit guard cho CI step.
- Tieu chi hoan thanh: CI runtime stack se chay read-only production preflight truoc smoke test; docs khong huong dan operator production chi dung host-only preflight; readiness audit fail neu CI step bi xoa.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`; chay `npm run prod:migrate:preflight` voi env hop le tren stack local dang running.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-083 - Harden CI temporary preflight env handling

- Muc tieu: Giam rui ro file env tam trong CI bi de lai hoac co permission rong sau production migration preflight smoke.
- File lien quan: `.github/workflows/ci.yml`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `umask 077` truoc khi tao `.env.ci-preflight`; them `trap 'rm -f .env.ci-preflight' EXIT`; them readiness audit guard cho cleanup va permission.
- Tieu chi hoan thanh: CI env tam duoc tao voi permission han che va tu dong xoa khi step ket thuc; readiness audit fail neu bo cleanup/umask.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; `git diff --check -- .github/workflows/ci.yml scripts/production-readiness-audit.js docs/PRODUCTION_READINESS_TASKS.md`.
- Trang thai: DONE.
- Muc uu tien: P2.

### T-084 - Propagate deploy compose context into migration preflight

- Muc tieu: Dam bao production migration preflight dung cung compose files va profiles voi deploy workflow, tranh lech context khi bat proxy/observability overlays.
- File lien quan: `scripts/production-migration-preflight.js`, `scripts/deploy-production.ps1`, `scripts/production-readiness-audit.js`, `docs/MIGRATIONS.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `--profile` cho production preflight script; truyen active compose files/profiles tu `deploy-production.ps1` vao preflight; cap nhat migration docs cho manual overlays; them readiness audit guard.
- Tieu chi hoan thanh: Deploy preflight dung chinh `$composeFiles` va profile active; script preflight chap nhan `--compose-file` va `--profile`; manual docs neu ro cach chay voi overlay.
- Cach kiem tra: `npm run prod:migrate:preflight -- --help`; chay `prod:migrate:preflight` voi env tam va `--compose-file docker-compose.proxy.yml --profile proxy` tren stack local; `npm run prod:deploy:dry-run -- -WithProxy -WithObservability ...`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-085 - Add proxy profile support to production verification

- Muc tieu: Dam bao `prod:verify` validate dung production compose profile khi stack duoc deploy voi bundled Caddy proxy.
- File lien quan: `scripts/verify-production.ps1`, `scripts/production-readiness-audit.js`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `-WithProxy` vao verify script; propagate `proxy` vao `PRODUCTION_COMPOSE_PROFILES` khi verify; cap nhat runbook; them readiness audit guard.
- Tieu chi hoan thanh: `prod:verify -- -WithProxy` chay env validation voi proxy profile active; docs huong dan dung `-WithProxy`, `-WithObservability`, hoac ca hai khi verify profile tuong ung.
- Cach kiem tra: `npm run prod:verify -- -EnvFile <env-hop-le> -DryRun -WithProxy -WithObservability -SkipSmoke -SkipLogCheck -ConfirmSkipGates`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-086 - Preserve workflow active profiles during env-file validation

- Muc tieu: Dam bao `deploy-production.ps1` va `verify-production.ps1` that su validate theo compose profiles dang active, du `validate-production-env.js` load `.env.production` va xoa stale shell env.
- File lien quan: `scripts/validate-production-env.js`, `scripts/deploy-production.ps1`, `scripts/verify-production.ps1`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them CLI `--active-profiles` cho env validator; ap dung override sau khi load env file; doi deploy/verify goi validator truc tiep voi `$activeProfilesValue`; them readiness audit guard.
- Tieu chi hoan thanh: Env file khong can khai bao `PRODUCTION_COMPOSE_PROFILES`; deploy/verify van validate dung `proxy`/`observability`/`none`; stale shell `PRODUCTION_COMPOSE_PROFILES` van bi xoa khi chay direct `prod:env:check`.
- Cach kiem tra: Chay validator voi env tam thieu proxy config va `--active-profiles proxy` de fail; chay deploy/verify dry-run voi `-WithProxy -WithObservability`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-087 - Reject unsafe product upload container paths in backup and restore

- Muc tieu: Tranh backup/restore product uploads copy nham container root hoac path khong an toan khi `PRODUCT_UPLOAD_DIR` trong env file bi cau hinh sai.
- File lien quan: `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `docs/BACKUP_RESTORE.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `Assert-SafeContainerPath` vao backup/restore; reject `PRODUCT_UPLOAD_DIR=/`, relative path, traversal, whitespace va trailing slash; cap nhat env validator cung reject root path; cap nhat runbook/audit guard.
- Tieu chi hoan thanh: Backup/restore fail som truoc khi tao/copy artifact neu upload path khong an toan; env validation fail voi `PRODUCT_UPLOAD_DIR=/`; docs ghi ro ràng buoc can thiet.
- Cach kiem tra: Chay backup voi env tam `PRODUCT_UPLOAD_DIR=/` va xac minh fail som; chay restore dry-run voi env tam `PRODUCT_UPLOAD_DIR=/` va backup path tam hop le de xac minh fail som; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-088 - Enforce raw trailing-slash rejection for backup upload paths

- Muc tieu: Dam bao backup/restore direct reject `PRODUCT_UPLOAD_DIR` co trailing slash, khop voi env validator va docs, thay vi trim truoc khi validate.
- File lien quan: `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Validate `$rawProductUploadDir` truc tiep trong backup/restore; chi gan `$productUploadDir` sau khi path hop le; them audit guard cho raw validation va trailing slash rejection.
- Tieu chi hoan thanh: Backup/restore fail som voi `PRODUCT_UPLOAD_DIR=/app/uploads/products/`; env validator cung fail; backup khong tao artifact khi fail path.
- Cach kiem tra: Negative backup/restore/env validation voi trailing slash; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-089 - Validate backup and restore database names before file operations

- Muc tieu: Tranh backup/restore dung `AUTH_DB`, `PRODUCT_DB`, `INVENTORY_DB`, `TRANSACTION_DB`, hoac `REPORT_DB` sai dinh dang de tao filename/path hoac goi `pg_dump`/`psql` voi DB name khong hop le.
- File lien quan: `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `scripts/production-readiness-audit.js`, `docs/BACKUP_RESTORE.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `Get-SafeDatabaseName` vao backup/restore; validate DB name theo PostgreSQL-safe identifier truoc khi tao backup target/read dump files; cap nhat docs va readiness audit guard.
- Tieu chi hoan thanh: Backup fail som va khong tao artifact khi env file co `AUTH_DB=../evil`; restore dry-run fail som truoc khi doc file voi DB name sai; docs ghi ro rang buoc database name.
- Cach kiem tra: Negative backup/restore voi `AUTH_DB=../evil`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-090 - Validate PostgreSQL role syntax in backup and restore

- Muc tieu: Tranh backup/restore direct dung `POSTGRES_USER` sai dinh dang lam loi muon trong `pg_dump`/`psql` hoac ghi manifest khong dang tin.
- File lien quan: `scripts/backup-production.ps1`, `scripts/restore-production.ps1`, `scripts/production-readiness-audit.js`, `docs/BACKUP_RESTORE.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `Assert-SafePostgresUser` vao backup/restore; validate role name theo PostgreSQL-safe identifier truoc khi tao artifact/doc backup files; cap nhat docs va readiness audit guard.
- Tieu chi hoan thanh: Backup fail som va khong tao artifact khi env file co `POSTGRES_USER=bad user`; restore dry-run fail som voi role sai; docs ghi ro rang buoc role name.
- Cach kiem tra: Negative backup/restore voi `POSTGRES_USER=bad user`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-091 - Validate PostgreSQL identifiers before production migration preflight

- Muc tieu: Chan cau hinh `POSTGRES_USER` hoac database name sai dinh dang truoc khi production migration preflight goi Docker/psql.
- File lien quan: `scripts/production-migration-preflight.js`, `scripts/production-readiness-audit.js`, `docs/MIGRATIONS.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `assertSafePostgresIdentifier`; validate `POSTGRES_USER` va database names cua cac service duoc chon truoc `docker compose ps` va `docker compose exec`; cap nhat migration docs va readiness audit guard.
- Tieu chi hoan thanh: Preflight voi `POSTGRES_USER=bad user` fail som ma khong goi Docker; preflight voi `AUTH_DB=../evil` fail som; preflight hop le van giu route kiem tra cu.
- Cach kiem tra: Negative preflight voi temp env co `POSTGRES_USER=bad user`; negative preflight voi temp env co `AUTH_DB=../evil`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-092 - Align POSTGRES_USER validation across production gates

- Muc tieu: Dam bao `prod:env:check` reject cung nhom `POSTGRES_USER` sai dinh dang ma backup/restore/preflight da reject, tranh deploy dry-run pass nhung maintenance gate fail muon.
- File lien quan: `scripts/validate-production-env.js`, `scripts/production-readiness-audit.js`, `.env.production.example`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them `validatePostgresRoleName` vao env validator; khong validate `POSTGRES_USER` bang rule URL-safe rong hon; cap nhat env example/runbook; them readiness audit guard.
- Tieu chi hoan thanh: `prod:env:check` voi `POSTGRES_USER=wms-prod` fail som; env hop le voi `POSTGRES_USER=wms_prod` van pass; docs khop rule PostgreSQL-safe identifier.
- Cach kiem tra: Negative env validator voi temp env co `POSTGRES_USER=wms-prod`; positive env validator voi temp env hop le; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-093 - Add runtime regression test for production env validation

- Muc tieu: Dam bao rule `POSTGRES_USER` PostgreSQL-safe identifier duoc kiem tra bang validator that, khong chi bang readiness audit tinh.
- File lien quan: `scripts/production-env-validation-test.js`, `package.json`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them script tao env file tam voi permission han che; chay `validate-production-env.js --active-profiles none`; verify env hop le pass va `POSTGRES_USER=wms-prod` fail; dua script vao `test:quality`; them readiness audit guard.
- Tieu chi hoan thanh: `npm run test:prod-env` pass; `npm run test:quality` chay regression moi; audit fail neu mat script/gate.
- Cach kiem tra: `npm run test:prod-env`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-094 - Document and audit production env regression wiring

- Muc tieu: Dam bao regression `test:prod-env` khong bi tach khoi quality/CI ma khong bi phat hien, va runbook testing/production notes mo ta dung gate moi.
- File lien quan: `scripts/production-readiness-audit.js`, `docs/TESTING.md`, `docs/PRODUCTION_NOTES.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them readiness audit guard yeu cau `test:quality` goi `npm run test:prod-env`; cap nhat testing docs ve CI/quality coverage; cap nhat production notes ve PostgreSQL-safe `POSTGRES_USER`.
- Tieu chi hoan thanh: Audit fail neu `test:quality` khong chay production env regression; docs ghi ro cach chay va pham vi test moi.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P2.

### T-095 - Add runtime regression test for production migration preflight validation

- Muc tieu: Dam bao `production-migration-preflight.js` reject role/database name sai truoc khi goi Docker, tranh loi cau hinh thanh loi runtime muon hoac phu thuoc container dang chay.
- File lien quan: `scripts/production-migration-preflight-test.js`, `package.json`, `scripts/production-readiness-audit.js`, `docs/TESTING.md`, `docs/PRODUCTION_NOTES.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them test tao env file tam va fake `docker` trong `PATH`; verify `POSTGRES_USER=bad user` va `AUTH_DB=../evil` fail voi message validation va khong in `DOCKER_CALLED`; dua test vao `test:quality`; them readiness audit/docs.
- Tieu chi hoan thanh: `npm run test:prod-migrate-preflight` pass; `npm run test:quality` chay test moi; audit fail neu test/gate bi go bo.
- Cach kiem tra: `npm run test:prod-migrate-preflight`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`; `npm run health:check`; `npm run prod:logs:check`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-096 - Revalidate full local smoke flow after production hardening

- Muc tieu: Chung minh stack local hien tai van chay du health, auth, CRUD, transaction, PDF, stock transfer, report export sau cac thay doi production-readiness gan nhat.
- File lien quan: `scripts/smoke-test.js`, `docs/TESTING.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Chay `npm run smoke:test`; khi local admin password drift gay 401, reset rieng local `admin@wms.local` ve demo password bang hash trong container auth-service; chay lai smoke; cap nhat testing docs ve credential smoke local.
- Tieu chi hoan thanh: Smoke pass end-to-end; inbound PDF tra `application/pdf`; invalid PDF UUID tra 400; mismatched PDF route tra 404; Excel export tra XLSX; khong dung demo fallback cho remote target.
- Cach kiem tra: `npm run smoke:test`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run build --workspaces`; `npm run health:check`; `npm run prod:logs:check`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-097 - Clean production/testing docs encoding and audit them

- Muc tieu: Loai bo mojibake trong `docs/TESTING.md` va `docs/PRODUCTION_NOTES.md`, dong thoi dua hai tai lieu nay vao readiness audit de khong tai phat.
- File lien quan: `docs/TESTING.md`, `docs/PRODUCTION_NOTES.md`, `scripts/production-readiness-audit.js`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Viet lai hai docs bang ASCII ro rang; giu noi dung ve CI, smoke, production env, migration preflight, security advisory; them hai file vao danh sach `assertNoMojibake` cua readiness audit.
- Tieu chi hoan thanh: Khong con chuoi mojibake trong hai docs; `npm run prod:readiness:audit` fail neu hai docs bi mojibake lai; quality/regression/build van pass.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`; `npm run health:check`; `npm run prod:logs:check`; `npm run security:audit`.
- Trang thai: DONE.
- Muc uu tien: P2.

### T-098 - Add runtime regression test for backup and restore config validation

- Muc tieu: Dam bao backup/restore reject cau hinh production sai truoc khi tao artifact backup hoac doc file restore, khong chi duoc bao ve bang audit tinh.
- File lien quan: `scripts/production-backup-restore-validation-test.js`, `package.json`, `scripts/production-readiness-audit.js`, `docs/TESTING.md`, `docs/PRODUCTION_NOTES.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them test Node phat hien `pwsh` hoac Windows PowerShell; tao env file tam; verify backup/restore fail som voi `POSTGRES_USER=bad user` va `AUTH_DB=../evil`; verify backup khong tao thu muc artifact khi config invalid; dua test vao `test:quality`; them audit/docs.
- Tieu chi hoan thanh: `npm run test:prod-backup-restore` pass hoac skip ro neu thieu PowerShell; `test:quality` chay test moi; audit fail neu test/gate bi go bo.
- Cach kiem tra: `npm run test:prod-backup-restore`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`; `npm run health:check`; `npm run prod:logs:check`; `npm run security:audit`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-099 - Require PowerShell Core in CI for production script regression tests

- Muc tieu: Tranh `test:prod-backup-restore` skip am tham tren CI neu runner khong co PowerShell, vi backup/restore production scripts la PowerShell.
- File lien quan: `.github/workflows/ci.yml`, `scripts/production-readiness-audit.js`, `docs/TESTING.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them CI step `pwsh --version` truoc security/quality gates; them readiness audit guard cho step nay; cap nhat testing docs phan biet CI fail som voi local skip ro rang.
- Tieu chi hoan thanh: CI fail som neu thieu `pwsh`; local van co the dung Windows PowerShell; audit fail neu CI guard bi go bo.
- Cach kiem tra: `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`; `npm run health:check`; `npm run prod:logs:check`; `npm run security:audit`.
- Trang thai: DONE.
- Muc uu tien: P1.

### T-100 - Make production PowerShell npm scripts cross-platform

- Muc tieu: Cho phep `npm run prod:deploy`, `prod:verify`, `prod:backup`, va `prod:restore` chay tren Linux/macOS co `pwsh` cung nhu Windows co Windows PowerShell, phu hop voi production server/CI thuc te.
- File lien quan: `scripts/run-powershell.js`, `package.json`, `scripts/deploy-production.ps1`, `scripts/production-readiness-audit.js`, `docs/DEPLOYMENT.md`, `docs/production-deployment.md`, `docs/PRODUCTION_READINESS_TASKS.md`.
- Cac buoc thuc hien: Them Node wrapper tu chon `pwsh` truoc roi fallback `powershell`; doi npm production scripts sang wrapper; doi deploy nested backup tu hard-code `powershell` sang `Get-PowerShellCommand`; cap nhat audit va runbook dung npm scripts thay vi direct `powershell`.
- Tieu chi hoan thanh: Npm production scripts khong hard-code Windows-only `powershell`; nested backup trong deploy chay bang shell co san; audit fail neu wrapper/gate bi go bo.
- Cach kiem tra: `npm run prod:deploy:dry-run -- -EnvFile <env-hop-le> -SkipBackup -SkipMigratePreflight -SkipSmoke -SkipLogCheck -NoBuild -ConfirmSkipGates`; `npm run prod:verify -- -EnvFile <env-hop-le> -DryRun -SkipSmoke -SkipLogCheck -ConfirmSkipGates`; `npm run prod:readiness:audit`; `npm run test:quality`; `npm run test:regression`; `npm run build --workspaces`.
- Trang thai: DONE.
- Muc uu tien: P1.
