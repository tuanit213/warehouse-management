const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ignoredDirs = new Set(['.git', '.next', 'dist', 'node_modules']);
const textExtensions = new Set(['.css', '.js', '.json', '.md', '.ps1', '.ts', '.tsx', '.yml', '.yaml']);
const mojibakePattern = /[\u00c3\u00c2\u00c4\u00c6\u00c5]|\u00e1[\u00ba\u00bb]/;
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (textExtensions.has(path.extname(entry.name))) checkFile(fullPath);
  }
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function checkFile(file) {
  if (path.basename(file) === 'package-lock.json') return;
  if (path.basename(file) === 'static-quality-check.js') return;
  const text = fs.readFileSync(file, 'utf8');
  if (mojibakePattern.test(text)) failures.push(`${rel(file)} contains likely mojibake text`);
  if (rel(file).endsWith('Dockerfile') && /start:dev|next dev|npm", "run", "dev/.test(text)) {
    failures.push(`${rel(file)} runs a development server in Docker`);
  }
}

walk(root);

const metricControllers = [
  'services/auth-service/src/health.controller.ts',
  'services/product-service/src/health.controller.ts',
  'services/inventory-service/src/health.controller.ts',
  'services/transaction-service/src/health.controller.ts',
  'services/report-service/src/health.controller.ts',
];

for (const controller of metricControllers) {
  const text = fs.readFileSync(path.join(root, controller), 'utf8');
  if (!/@Get\('metrics'\)/.test(text)) failures.push(`${controller} is missing a metrics endpoint`);
  if (!/text\/plain/.test(text)) failures.push(`${controller} metrics endpoint must return Prometheus text`);
}

const gateway = fs.readFileSync(path.join(root, 'services/api-gateway/src/gateway.controller.ts'), 'utf8');
if (!/@Get\('metrics'\)/.test(gateway)) failures.push('services/api-gateway/src/gateway.controller.ts is missing gateway metrics');

function readProjectFile(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function requirePattern(file, pattern, description) {
  const text = readProjectFile(file);
  if (!pattern.test(text)) failures.push(`${file} must ${description}`);
}

function requireLiteral(file, literal, description) {
  const text = readProjectFile(file);
  if (!text.includes(literal)) failures.push(`${file} must ${description}`);
}

const runtimeRoute = 'frontend/app/api/runtime-config/route.ts';
requireLiteral(runtimeRoute, "dynamic = 'force-dynamic'", 'force dynamic runtime configuration');
requireLiteral(runtimeRoute, 'cache-control', 'disable runtime config caching');
requireLiteral(runtimeRoute, 'no-store', 'disable runtime config caching');
requireLiteral(runtimeRoute, 'window.__WMS_CONFIG__', 'emit the browser runtime config object');
requireLiteral(runtimeRoute, 'ALLOW_LOCAL_PRODUCTION_URLS', 'keep the explicit local production override');
requireLiteral(runtimeRoute, 'NEXT_PUBLIC_API_URL must use https in production', 'reject public HTTP API URLs in production');

const frontendApi = 'frontend/lib/api.ts';
requireLiteral(frontendApi, 'Runtime config error', 'surface runtime config errors to the client');
requireLiteral(frontendApi, 'NEXT_PUBLIC_API_URL is required in production', 'fail fast when production API URL is missing');
requireLiteral(frontendApi, 'assertUsableApiUrl', 'validate API URLs before use');
requireLiteral(frontendApi, "typeof window === 'undefined'", 'keep server-only prerender fallback guarded');
requireLiteral(frontendApi, 'ALLOW_LOCAL_PRODUCTION_URLS', 'keep the explicit local production override');

const healthCheck = 'scripts/health-check.js';
requireLiteral(healthCheck, '/api/runtime-config', 'verify frontend runtime config during health checks');
requireLiteral(healthCheck, 'window\\.__WMS_CONFIG__', 'parse the frontend runtime config script');
requireLiteral(healthCheck, 'Runtime config apiUrl mismatch', 'compare runtime API URL with verification API_URL');
requireLiteral(healthCheck, 'HEALTH_CHECK_RETRIES', 'retry post-deploy health checks');

const deployScript = 'scripts/deploy-production.ps1';
requireLiteral(deployScript, 'security:audit', 'run the tracked security audit during deploy');
requireLiteral(deployScript, 'HEALTH_CHECK_RETRIES', 'set retry defaults before post-deploy health checks');
requireLiteral(deployScript, 'ConfirmSkipGates', 'require explicit confirmation for skipped safety gates');
requireLiteral(deployScript, 'config", "--quiet"', 'validate Docker Compose without dumping resolved secrets');
requireLiteral(deployScript, 'AllowDirtyWorktree', 'guard real production deploys from dirty worktrees');

const logCheck = 'scripts/production-log-check.js';
requireLiteral(logCheck, 'OOMKilled', 'fail when a core container was OOM-killed');
requireLiteral(logCheck, 'RestartCount', 'inspect container restart counts');
requirePattern(logCheck, /state\.Health\?\.Status/, 'inspect Docker health status');
requireLiteral(logCheck, 'LOG_CHECK_MAX_RESTARTS', 'keep restart-count threshold configurable');

const backupScript = 'scripts/backup-production.ps1';
requireLiteral(backupScript, 'status = "IN_PROGRESS"', 'mark new backups as in progress before writing data');
requireLiteral(backupScript, 'status = "COMPLETED"', 'mark backups completed only after all artifacts are written');
requireLiteral(backupScript, 'completedAt', 'record backup completion time');

const seedDemoScript = 'scripts/seed-demo-data.js';
requireLiteral(seedDemoScript, 'adminPasswordFromEnv', 'track whether demo admin password came from environment');
requireLiteral(seedDemoScript, '[redacted: loaded from environment]', 'not print environment-provided demo admin password');

const restoreScript = 'scripts/restore-production.ps1';
requireLiteral(restoreScript, 'not COMPLETED', 'reject partial backup manifests');
requireLiteral(restoreScript, 'Checksum mismatch', 'validate backup checksums before restore');
requireLiteral(restoreScript, 'ConfirmRestore', 'require explicit confirmation for destructive restores');

const compose = readProjectFile('docker-compose.yml');
const devInternalTokenCount = (compose.match(/INTERNAL_GATEWAY_TOKEN: \$\{INTERNAL_GATEWAY_TOKEN:-local-dev-internal-gateway-token\}/g) || []).length;
if (devInternalTokenCount < 6) failures.push('docker-compose.yml must pass the same local INTERNAL_GATEWAY_TOKEN to gateway and backend services');
const composeHealthcheckCount = (compose.match(/healthcheck:/g) || []).length;
if (composeHealthcheckCount < 14) failures.push('docker-compose.yml must define healthchecks for frontend, app services, databases, Redis, and RabbitMQ');
if (!/frontend:[\s\S]*?depends_on:[\s\S]*?api-gateway:[\s\S]*?condition: service_healthy/.test(compose)) {
  failures.push('docker-compose.yml frontend must wait for api-gateway health');
}
for (const service of ['auth-service', 'product-service', 'inventory-service', 'transaction-service', 'report-service']) {
  const gatewayDependsPattern = new RegExp(`api-gateway:[\\s\\S]*?depends_on:[\\s\\S]*?${service}:[\\s\\S]*?condition: service_healthy`);
  if (!gatewayDependsPattern.test(compose)) failures.push(`docker-compose.yml api-gateway must wait for ${service} health`);
}
for (const endpoint of [
  'http://localhost:3000/api/health/ready',
  'http://localhost:3001/api/health',
  'http://localhost:3002/api/health',
  'http://localhost:3003/api/health',
  'http://localhost:3004/api/health',
  'http://localhost:3005/api/health',
]) {
  if (!compose.includes(endpoint)) failures.push(`docker-compose.yml must healthcheck ${endpoint}`);
}

requireLiteral('services/transaction-service/src/transaction.service.ts', 'Phiếu nhập kho', 'keep Vietnamese voucher titles readable');
requireLiteral('services/transaction-service/src/transaction-pdf.renderer.ts', 'Người lập phiếu', 'keep Vietnamese signature labels readable');
requireLiteral('scripts/smoke-test.js', "unit: 'cái'", 'seed smoke data with readable Vietnamese units');

if (failures.length) {
  console.error('Static quality check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[OK] Static quality check');
