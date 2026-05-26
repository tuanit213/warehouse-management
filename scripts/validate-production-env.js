const fs = require('fs');
const path = require('path');

const REQUIRED = [
  'NODE_ENV',
  'JWT_SECRET',
  'INTERNAL_GATEWAY_TOKEN',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'RABBITMQ_DEFAULT_USER',
  'RABBITMQ_DEFAULT_PASS',
  'CORS_ORIGIN',
  'NEXT_PUBLIC_API_URL',
  'PRODUCT_PUBLIC_BASE_URL',
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_PASSWORD',
];
const WEAK_VALUES = new Set(['change-me-super-secret', 'postgres', 'guest', 'password', 'admin', 'changeme']);
const PLACEHOLDER_PATTERN = /replace-with|change-this|example|placeholder|your-|localhost-only/i;
const PUBLIC_URL_KEYS = ['CORS_ORIGIN', 'NEXT_PUBLIC_API_URL', 'PRODUCT_PUBLIC_BASE_URL'];
const OPTIONAL_SECRET_KEYS = [
  'SMOKE_ADMIN_PASSWORD',
  'SMOKE_ADMIN_ACCESS_TOKEN',
  'WMS_ADMIN_ACCESS_TOKEN',
  'GRAFANA_ADMIN_PASSWORD',
];
const OPTIONAL_VALIDATED_KEYS = [
  'ALLOW_LOCAL_PRODUCTION_URLS',
  'SMOKE_ADMIN_EMAIL',
  'PUBLIC_FRONTEND_HOST',
  'PUBLIC_API_HOST',
  'ACME_EMAIL',
  'PRODUCT_UPLOAD_DIR',
  'OBSERVABILITY_BIND_HOST',
  'OBSERVABILITY_EXPOSE_PUBLIC',
];
const COMPOSE_OPTIONAL_KEYS = [
  'JWT_EXPIRES_IN',
  'REFRESH_TOKEN_DAYS',
  'AUTH_DB',
  'PRODUCT_DB',
  'INVENTORY_DB',
  'TRANSACTION_DB',
  'REPORT_DB',
  'BOOTSTRAP_ADMIN_NAME',
  'PRODUCT_IMAGE_MAX_BYTES',
  'FRONTEND_PORT',
  'HTTP_PORT',
  'HTTPS_PORT',
  'PROXY_TIMEOUT_MS',
  'AUTH_VERIFY_TIMEOUT_MS',
  'INVENTORY_API_URL',
  'PRODUCT_API_URL',
  'TRANSACTION_OUTBOX_PUBLISHER_ENABLED',
  'TRANSACTION_OUTBOX_EXCHANGE',
  'TRANSACTION_OUTBOX_DEAD_EXCHANGE',
  'TRANSACTION_OUTBOX_DEAD_QUEUE',
  'TRANSACTION_OUTBOX_POLL_MS',
  'TRANSACTION_OUTBOX_BATCH_SIZE',
  'TRANSACTION_OUTBOX_MAX_ATTEMPTS',
  'TRANSACTION_OUTBOX_STALE_MINUTES',
  'INVENTORY_TRANSACTION_CONSUMER_ENABLED',
  'INVENTORY_TRANSACTION_EVENTS_QUEUE',
  'INVENTORY_TRANSACTION_DEAD_EXCHANGE',
  'INVENTORY_TRANSACTION_DEAD_QUEUE',
  'INVENTORY_TRANSACTION_CONSUMER_PREFETCH',
  'PROMETHEUS_PORT',
  'PROMETHEUS_RETENTION',
  'GRAFANA_PORT',
  'GRAFANA_ADMIN_USER',
  'LOKI_PORT',
  'PRODUCTION_COMPOSE_PROFILES',
];

function parseArgs(argv) {
  const args = { activeProfiles: null };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--active-profiles') {
      args.activeProfiles = argv[++i] || '';
    } else if (arg === '--help') {
      console.log('Usage: node scripts/validate-production-env.js [--active-profiles none|proxy|observability|proxy,observability]');
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function getManagedEnvKeys() {
  return new Set([...REQUIRED, ...PUBLIC_URL_KEYS, ...OPTIONAL_SECRET_KEYS, ...OPTIONAL_VALIDATED_KEYS, ...COMPOSE_OPTIONAL_KEYS]);
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  for (const key of getManagedEnvKeys()) delete process.env[key];
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
  return true;
}

const envFile = process.env.PRODUCTION_ENV_FILE || path.resolve(__dirname, '..', '.env.production');
const cliArgs = parseArgs(process.argv);
const loaded = loadEnvFile(envFile);
if (cliArgs.activeProfiles !== null) process.env.PRODUCTION_COMPOSE_PROFILES = cliArgs.activeProfiles;

function isLocalProductionUrlAllowed() {
  return process.env.ALLOW_LOCAL_PRODUCTION_URLS === 'true';
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function parseUrl(key, value) {
  try {
    return new URL(value);
  } catch {
    fail(`${key} must be a valid absolute URL`);
    return null;
  }
}

function isLocalOrPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

function validatePublicUrl(key) {
  const value = process.env[key];
  if (!value) return;
  const url = parseUrl(key, value);
  if (!url) return;
  if (!['http:', 'https:'].includes(url.protocol)) fail(`${key} must use http or https`);
  if (url.username || url.password) fail(`${key} must not include embedded credentials`);
  if (url.search || url.hash) fail(`${key} must not include query string or hash fragment`);
  if (key === 'CORS_ORIGIN' && (url.pathname !== '/' || url.search || url.hash)) {
    fail('CORS_ORIGIN must be an origin only, without path, query, or hash');
  }
  if (!isLocalProductionUrlAllowed() && isLocalOrPrivateHost(url.hostname)) {
    fail(`${key} must point to a public production host, not ${url.hostname}. Set ALLOW_LOCAL_PRODUCTION_URLS=true only for local production-like validation.`);
  }
  if (!isLocalProductionUrlAllowed() && url.protocol !== 'https:') fail(`${key} must use https in production`);
  return url;
}

function validateProxyHost(key, expectedHostname) {
  const value = process.env[key];
  if (!value) return;
  if (PLACEHOLDER_PATTERN.test(value)) fail(`${key} uses an unsafe placeholder/default value`);
  if (/^https?:\/\//i.test(value) || value.includes('/') || value.includes(':')) {
    fail(`${key} must be a hostname only, without scheme, path, or port`);
    return;
  }
  if (!isLocalProductionUrlAllowed() && isLocalOrPrivateHost(value)) {
    fail(`${key} must point to a public production host, not ${value}. Set ALLOW_LOCAL_PRODUCTION_URLS=true only for local production-like validation.`);
  }
  if (expectedHostname && value.toLowerCase() !== expectedHostname.toLowerCase()) {
    fail(`${key} (${value}) must match ${expectedHostname}`);
  }
}

function validateEmail(key) {
  const value = process.env[key];
  if (!value) return;
  if (PLACEHOLDER_PATTERN.test(value)) fail(`${key} uses an unsafe placeholder/default value`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    fail(`${key} must be a valid email address`);
    return;
  }
  const domain = value.split('@').pop();
  if (!isLocalProductionUrlAllowed() && domain && isLocalOrPrivateHost(domain)) {
    fail(`${key} must use a public production email domain, not ${domain}. Set ALLOW_LOCAL_PRODUCTION_URLS=true only for local production-like validation.`);
  }
}

function validateSensitiveValue(key, { required = false } = {}) {
  const value = process.env[key];
  if (!value) {
    if (required) fail(`${key} is required${loaded ? '' : ' (.env.production was not found and no process env value was provided)'}`);
    return;
  }
  if (WEAK_VALUES.has(value.toLowerCase()) || PLACEHOLDER_PATTERN.test(value)) fail(`${key} uses an unsafe placeholder/default value`);
  if ((key.includes('SECRET') || key.includes('TOKEN')) && value.length < 32) fail(`${key} must be at least 32 characters`);
  if ((key.includes('PASSWORD') || key.endsWith('_PASS')) && value.length < 12) fail(`${key} must be at least 12 characters`);
}

function validateUrlCredentialComponent(key) {
  const value = process.env[key];
  if (!value) return;
  if (!/^[A-Za-z0-9._~-]+$/.test(value)) {
    fail(`${key} is embedded in a connection URL and must use only URL-safe unreserved characters: letters, numbers, dot, underscore, tilde, or hyphen`);
  }
}

function validatePostgresRoleName(key) {
  const value = process.env[key];
  if (!value) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    fail(`${key} must be a PostgreSQL role name using letters, numbers, and underscores, starting with a letter or underscore, up to 63 characters`);
  }
}

function validateContainerPath(key) {
  const value = process.env[key];
  if (!value) return;
  if (!value.startsWith('/')) fail(`${key} must be an absolute Linux container path`);
  if (value === '/') fail(`${key} must not be the container root path`);
  if (value.includes('..')) fail(`${key} must not contain path traversal segments`);
  if (/\s/.test(value)) fail(`${key} must not contain whitespace`);
  if (value.length > 1 && value.endsWith('/')) fail(`${key} must not end with a trailing slash`);
}

function validateBoolean(key) {
  const value = process.env[key];
  if (!value) return;
  if (!['true', 'false'].includes(value)) fail(`${key} must be either true or false`);
}

function validateInteger(key, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = process.env[key];
  if (!value) return;
  if (!/^\d+$/.test(value)) {
    fail(`${key} must be an integer`);
    return;
  }
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < min || numeric > max) {
    fail(`${key} must be between ${min} and ${max}`);
  }
}

function readInteger(key, fallback) {
  const value = process.env[key] || String(fallback);
  if (!/^\d+$/.test(value)) return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

function validateDbName(key) {
  const value = process.env[key];
  if (!value) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    fail(`${key} must be a PostgreSQL database name using letters, numbers, and underscores, starting with a letter or underscore, up to 63 characters`);
  }
}

function validateDuration(key, { units, example }) {
  const value = process.env[key];
  if (!value) return;
  const unitPattern = units.map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = new RegExp(`^[1-9]\\d*(${unitPattern})$`);
  if (!pattern.test(value)) fail(`${key} must be a positive duration like ${example}`);
}

function validateBindHost(key) {
  const value = process.env[key];
  if (!value) return;
  if (/\s/.test(value)) fail(`${key} must not contain whitespace`);
  if (value.includes('/') || value.includes(':')) fail(`${key} must be a bind host only, without scheme, path, or port`);
  if (!/^(\*|0\.0\.0\.0|127(?:\.\d{1,3}){3}|localhost|[A-Za-z0-9.-]+)$/.test(value)) {
    fail(`${key} must be a valid bind host such as 127.0.0.1 or 0.0.0.0`);
  }
}

function validateInternalUrl(key) {
  const value = process.env[key];
  if (!value) return;
  if (PLACEHOLDER_PATTERN.test(value)) fail(`${key} uses an unsafe placeholder/default value`);
  const url = parseUrl(key, value);
  if (!url) return;
  if (!['http:', 'https:'].includes(url.protocol)) fail(`${key} must use http or https`);
  if (url.username || url.password) fail(`${key} must not include credentials`);
  if (['localhost', '0.0.0.0', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase()) || /^127\./.test(url.hostname)) {
    fail(`${key} must point to a service hostname reachable from the container network, not ${url.hostname}`);
  }
}

function validateDistinctPorts(portDefaults) {
  const seen = new Map();
  for (const [key, fallback] of Object.entries(portDefaults)) {
    const port = readInteger(key, fallback);
    if (!port) continue;
    const firstKey = seen.get(port);
    if (firstKey) {
      fail(`${key} (${port}) conflicts with ${firstKey}. Production host ports must be unique.`);
    } else {
      seen.set(port, key);
    }
  }
}

function isObservabilityConfigured() {
  return Boolean(
    process.env.PROMETHEUS_PORT ||
      process.env.PROMETHEUS_RETENTION ||
      process.env.GRAFANA_PORT ||
      process.env.GRAFANA_ADMIN_USER ||
      process.env.GRAFANA_ADMIN_PASSWORD ||
      process.env.LOKI_PORT ||
      process.env.OBSERVABILITY_BIND_HOST ||
      process.env.OBSERVABILITY_EXPOSE_PUBLIC,
  );
}

function getActiveComposeProfiles() {
  const value = process.env.PRODUCTION_COMPOSE_PROFILES;
  if (!value) return null;
  const profiles = value
    .split(',')
    .map((profile) => profile.trim())
    .filter(Boolean);
  const allowedProfiles = new Set(['none', 'proxy', 'observability']);
  for (const profile of profiles) {
    if (!allowedProfiles.has(profile)) fail(`PRODUCTION_COMPOSE_PROFILES contains unsupported profile: ${profile}`);
  }
  const uniqueProfiles = new Set(profiles);
  if (uniqueProfiles.size !== profiles.length) fail('PRODUCTION_COMPOSE_PROFILES must not contain duplicate profiles');
  if (uniqueProfiles.has('none') && uniqueProfiles.size > 1) fail('PRODUCTION_COMPOSE_PROFILES=none cannot be combined with other profiles');
  return uniqueProfiles;
}

for (const key of REQUIRED) validateSensitiveValue(key, { required: true });
for (const key of OPTIONAL_SECRET_KEYS) validateSensitiveValue(key);
validatePostgresRoleName('POSTGRES_USER');
for (const key of ['POSTGRES_PASSWORD', 'RABBITMQ_DEFAULT_USER', 'RABBITMQ_DEFAULT_PASS']) {
  validateUrlCredentialComponent(key);
}

if (process.env.NODE_ENV !== 'production') fail('NODE_ENV must be production for production deploy validation');
if (process.env.CORS_ORIGIN === '*') fail('CORS_ORIGIN must not be * in production');
validateBoolean('ALLOW_LOCAL_PRODUCTION_URLS');
const publicUrls = new Map(PUBLIC_URL_KEYS.map((key) => [key, validatePublicUrl(key)]));
const proxyConfigured = Boolean(process.env.PUBLIC_FRONTEND_HOST || process.env.PUBLIC_API_HOST || process.env.ACME_EMAIL);
const activeComposeProfiles = getActiveComposeProfiles();
const proxyProfileActive = activeComposeProfiles ? activeComposeProfiles.has('proxy') : proxyConfigured;
const observabilityProfileActive = activeComposeProfiles ? activeComposeProfiles.has('observability') : isObservabilityConfigured();
if (proxyConfigured || proxyProfileActive) {
  if (!process.env.PUBLIC_FRONTEND_HOST) fail('PUBLIC_FRONTEND_HOST is required when proxy settings are configured');
  if (!process.env.PUBLIC_API_HOST) fail('PUBLIC_API_HOST is required when proxy settings are configured');
  if (!process.env.ACME_EMAIL) fail('ACME_EMAIL is required when proxy settings are configured');
  validateProxyHost('PUBLIC_FRONTEND_HOST', publicUrls.get('CORS_ORIGIN')?.hostname);
  validateProxyHost('PUBLIC_API_HOST', publicUrls.get('NEXT_PUBLIC_API_URL')?.hostname);
  validateEmail('ACME_EMAIL');
}
if (observabilityProfileActive && !process.env.GRAFANA_ADMIN_PASSWORD) {
  fail('GRAFANA_ADMIN_PASSWORD is required when observability profile is active');
}
validateEmail('BOOTSTRAP_ADMIN_EMAIL');
validateEmail('SMOKE_ADMIN_EMAIL');
if (process.env.JWT_SECRET && process.env.INTERNAL_GATEWAY_TOKEN && process.env.JWT_SECRET === process.env.INTERNAL_GATEWAY_TOKEN) {
  fail('JWT_SECRET and INTERNAL_GATEWAY_TOKEN must be different values');
}

if (process.env.BOOTSTRAP_ADMIN_PASSWORD && process.env.BOOTSTRAP_ADMIN_PASSWORD.length < 12) fail('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters');
if (process.env.BOOTSTRAP_ADMIN_PASSWORD && PLACEHOLDER_PATTERN.test(process.env.BOOTSTRAP_ADMIN_PASSWORD)) fail('BOOTSTRAP_ADMIN_PASSWORD uses an unsafe placeholder/default value');
if (process.env.BOOTSTRAP_ADMIN_PASSWORD && process.env.POSTGRES_PASSWORD && process.env.BOOTSTRAP_ADMIN_PASSWORD === process.env.POSTGRES_PASSWORD) {
  fail('BOOTSTRAP_ADMIN_PASSWORD must be different from POSTGRES_PASSWORD');
}
if (process.env.SMOKE_ADMIN_PASSWORD && process.env.POSTGRES_PASSWORD && process.env.SMOKE_ADMIN_PASSWORD === process.env.POSTGRES_PASSWORD) {
  fail('SMOKE_ADMIN_PASSWORD must be different from POSTGRES_PASSWORD');
}
if (process.env.GRAFANA_ADMIN_PASSWORD && process.env.POSTGRES_PASSWORD && process.env.GRAFANA_ADMIN_PASSWORD === process.env.POSTGRES_PASSWORD) {
  fail('GRAFANA_ADMIN_PASSWORD must be different from POSTGRES_PASSWORD');
}
validateContainerPath('PRODUCT_UPLOAD_DIR');
validateDuration('JWT_EXPIRES_IN', { units: ['ms', 's', 'm', 'h', 'd'], example: '15m' });
validateInteger('REFRESH_TOKEN_DAYS', { min: 1, max: 365 });
for (const key of ['AUTH_DB', 'PRODUCT_DB', 'INVENTORY_DB', 'TRANSACTION_DB', 'REPORT_DB']) validateDbName(key);
for (const key of ['FRONTEND_PORT', 'HTTP_PORT', 'HTTPS_PORT', 'PROMETHEUS_PORT', 'GRAFANA_PORT', 'LOKI_PORT']) {
  validateInteger(key, { min: 1, max: 65535 });
}
const activeHostPortDefaults = {
};
if (!proxyProfileActive) {
  activeHostPortDefaults.FRONTEND_PORT = 3006;
}
if (proxyProfileActive) {
  activeHostPortDefaults.HTTP_PORT = 80;
  activeHostPortDefaults.HTTPS_PORT = 443;
}
if (observabilityProfileActive) {
  activeHostPortDefaults.PROMETHEUS_PORT = 9090;
  activeHostPortDefaults.GRAFANA_PORT = 3008;
  activeHostPortDefaults.LOKI_PORT = 3100;
}
validateDistinctPorts(activeHostPortDefaults);
for (const key of ['PROXY_TIMEOUT_MS', 'AUTH_VERIFY_TIMEOUT_MS', 'PRODUCT_IMAGE_MAX_BYTES', 'TRANSACTION_OUTBOX_POLL_MS']) {
  validateInteger(key, { min: 1, max: 2147483647 });
}
validateInteger('TRANSACTION_OUTBOX_BATCH_SIZE', { min: 1, max: 1000 });
validateInteger('TRANSACTION_OUTBOX_MAX_ATTEMPTS', { min: 1, max: 1000 });
validateInteger('TRANSACTION_OUTBOX_STALE_MINUTES', { min: 1, max: 1440 });
validateInteger('INVENTORY_TRANSACTION_CONSUMER_PREFETCH', { min: 1, max: 1000 });
for (const key of ['TRANSACTION_OUTBOX_PUBLISHER_ENABLED', 'INVENTORY_TRANSACTION_CONSUMER_ENABLED', 'OBSERVABILITY_EXPOSE_PUBLIC']) validateBoolean(key);
for (const key of ['INVENTORY_API_URL', 'PRODUCT_API_URL']) validateInternalUrl(key);
validateDuration('PROMETHEUS_RETENTION', { units: ['ms', 's', 'm', 'h', 'd', 'w', 'y'], example: '15d' });

const observabilityBindHost = process.env.OBSERVABILITY_BIND_HOST;
validateBindHost('OBSERVABILITY_BIND_HOST');
if (observabilityBindHost && ['0.0.0.0', '::', '*'].includes(observabilityBindHost) && process.env.OBSERVABILITY_EXPOSE_PUBLIC !== 'true') {
  fail('OBSERVABILITY_BIND_HOST exposes observability ports publicly. Set OBSERVABILITY_EXPOSE_PUBLIC=true only after adding firewall or proxy authentication.');
}

if (!process.exitCode) console.log(`[OK] Production environment looks safe (${loaded ? envFile : 'process env'})`);
