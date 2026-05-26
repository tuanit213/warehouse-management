const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];
const warnings = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function assertFile(file) {
  if (!exists(file)) fail(`Missing required file: ${file}`);
}

function assertIncludes(file, value, description) {
  const text = read(file);
  if (!text.includes(value)) fail(`${file} must include ${description}`);
}

function assertDoesNotInclude(file, value, description) {
  const text = read(file);
  if (text.includes(value)) fail(`${file} must ${description}`);
}

function assertNoMojibake(file) {
  const text = read(file);
  const mojibakePattern = /[\u00c3\u00c2\u00c4\u00c6\u00c5]|\u00e1[\u00bb\u00ba]/u;
  if (mojibakePattern.test(text)) fail(`${file} contains likely mojibake text`);
}

function checkPackageScripts() {
  const pkg = JSON.parse(read('package.json'));
  const scripts = pkg.scripts || {};
  const requiredScripts = [
    'test:quality',
    'test:prod-env',
    'test:prod-migrate-preflight',
    'test:prod-backup-restore',
    'test:regression',
    'health:check',
    'smoke:test',
    'prod:env:check',
    'prod:migrate:preflight',
    'security:audit',
    'prod:config',
    'prod:proxy:config',
    'prod:deploy',
    'prod:deploy:dry-run',
    'prod:verify',
    'prod:logs:check',
    'prod:backup',
    'prod:restore',
    'observability:config',
    'observability:check',
  ];

  for (const script of requiredScripts) {
    if (!scripts[script]) fail(`package.json is missing npm script: ${script}`);
  }

  if (scripts['prod:config'] && !scripts['prod:config'].includes('config --quiet')) {
    fail('prod:config must validate compose with config --quiet');
  }
  if (scripts['prod:proxy:config'] && !scripts['prod:proxy:config'].includes('config --quiet')) {
    fail('prod:proxy:config must validate compose with config --quiet');
  }
  if (scripts['observability:config'] && !scripts['observability:config'].includes('config --quiet')) {
    fail('observability:config must validate compose with config --quiet');
  }
  if (scripts['prod:deploy'] && !scripts['prod:deploy'].includes('scripts/deploy-production.ps1')) {
    fail('prod:deploy must use scripts/deploy-production.ps1');
  }
  if (scripts['prod:deploy'] && !scripts['prod:deploy'].includes('scripts/run-powershell.js')) {
    fail('prod:deploy must use the cross-platform PowerShell runner');
  }
  if (scripts['prod:deploy:dry-run'] && !scripts['prod:deploy:dry-run'].includes('-DryRun')) {
    fail('prod:deploy:dry-run must run deploy-production.ps1 with -DryRun');
  }
  if (scripts['prod:verify'] && !scripts['prod:verify'].includes('scripts/verify-production.ps1')) {
    fail('prod:verify must use scripts/verify-production.ps1');
  }
  for (const script of ['prod:deploy:dry-run', 'prod:verify', 'prod:backup', 'prod:restore']) {
    if (scripts[script] && !scripts[script].includes('scripts/run-powershell.js')) {
      fail(`${script} must use the cross-platform PowerShell runner`);
    }
  }
  if (scripts['test:quality'] && !scripts['test:quality'].includes('npm run test:prod-env')) {
    fail('test:quality must run the production env validation regression test');
  }
  if (scripts['test:quality'] && !scripts['test:quality'].includes('npm run test:prod-migrate-preflight')) {
    fail('test:quality must run the production migration preflight regression test');
  }
  if (scripts['test:quality'] && !scripts['test:quality'].includes('npm run test:prod-backup-restore')) {
    fail('test:quality must run the production backup/restore validation regression test');
  }
}

function parseTasks() {
  const text = read('docs/PRODUCTION_READINESS_TASKS.md');
  const tasks = [];
  const sections = text.split(/^### /m).slice(1);
  for (const section of sections) {
    const lines = section.split(/\r?\n/);
    const heading = lines.shift() || '';
    const headingMatch = heading.match(/^(T-\d+) - (.+)$/u);
    if (!headingMatch) continue;
    const [, id, title] = headingMatch;
    const body = lines.join('\n');
    const status = body.match(/- Tr(?:ạ|a)ng th(?:á|a)i:\s*([A-Z_]+)/u)?.[1];
    const priority = body.match(/- M(?:ứ|u)c (?:ư|u)u ti(?:ê|e)n:\s*(P\d+)/u)?.[1];
    tasks.push({ id, title: title.trim(), status, priority });
  }
  return tasks;
}

function checkTaskList() {
  assertNoMojibake('docs/PRODUCTION_READINESS_TASKS.md');

  const tasks = parseTasks();
  if (tasks.length < 40) fail(`Production readiness task list looks incomplete: found ${tasks.length} tasks`);

  const missingStatus = tasks.filter((task) => !task.status);
  if (missingStatus.length) fail(`Tasks missing status: ${missingStatus.map((task) => task.id).join(', ')}`);

  const missingPriority = tasks.filter((task) => !task.priority);
  if (missingPriority.length) fail(`Tasks missing priority: ${missingPriority.map((task) => task.id).join(', ')}`);

  const unfinished = tasks.filter((task) => ['TODO', 'IN_PROGRESS'].includes(task.status));
  if (unfinished.length) fail(`Tasks still unfinished: ${unfinished.map((task) => `${task.id}:${task.status}`).join(', ')}`);

  const blocked = tasks.filter((task) => task.status === 'BLOCKED');
  const allowedBlocked = new Set(['T-004']);
  const unexpectedBlocked = blocked.filter((task) => !allowedBlocked.has(task.id));
  if (unexpectedBlocked.length) fail(`Unexpected blocked tasks: ${unexpectedBlocked.map((task) => task.id).join(', ')}`);
  if (!blocked.some((task) => task.id === 'T-004')) {
    warn('T-004 is not marked BLOCKED. If production was deployed, verify URL, health, smoke, and logs before marking the goal complete.');
  }
}

function checkRequiredArtifacts() {
  [
    'services/transaction-service/src/transaction-pdf.renderer.ts',
    'frontend/app/api/runtime-config/route.ts',
    'scripts/deploy-production.ps1',
    'scripts/verify-production.ps1',
    'scripts/run-powershell.js',
    'scripts/production-migration-preflight.js',
    'scripts/production-log-check.js',
    'scripts/security-audit-check.js',
    'scripts/backup-production.ps1',
    'scripts/restore-production.ps1',
    'scripts/observability-check.js',
    'docker-compose.proxy.yml',
    'docker-compose.observability.yml',
    'ops/caddy/Caddyfile',
  ].forEach(assertFile);

  assertIncludes('scripts/deploy-production.ps1', 'ConfirmSkipGates', 'explicit skipped-gate confirmation');
  assertIncludes('scripts/deploy-production.ps1', 'function Get-PowerShellCommand', 'cross-platform nested PowerShell command resolution');
  assertIncludes('scripts/deploy-production.ps1', 'Get-Command pwsh', 'nested deploy backup prefers PowerShell Core when available');
  assertIncludes('scripts/deploy-production.ps1', 'security:audit', 'security audit deploy gate');
  assertIncludes('scripts/deploy-production.ps1', 'scripts/production-migration-preflight.js', 'compose-network-aware production migration preflight');
  assertIncludes('scripts/deploy-production.ps1', '$preflightArgs += @("--compose-file", $file)', 'deploy passes active compose files to migration preflight');
  assertIncludes('scripts/deploy-production.ps1', '$preflightArgs += @("--profile", "observability")', 'deploy passes observability profile to migration preflight');
  assertIncludes('scripts/deploy-production.ps1', '$preflightArgs += @("--profile", "proxy")', 'deploy passes proxy profile to migration preflight');
  assertIncludes('scripts/deploy-production.ps1', 'config", "--quiet"', 'quiet compose validation');
  assertIncludes('scripts/deploy-production.ps1', '[Environment]::SetEnvironmentVariable($key, $value.Trim', 'deterministic env-file loading during deploy');
  assertIncludes('scripts/deploy-production.ps1', '[Environment]::SetEnvironmentVariable($key, $null, "Process")', 'clearing stale managed process env during deploy env-file loading');
  assertIncludes('scripts/deploy-production.ps1', '"SMOKE_ADMIN_ACCESS_TOKEN"', 'stale smoke token clearing during deploy env-file loading');
  assertIncludes('scripts/deploy-production.ps1', '"PRODUCT_UPLOAD_DIR"', 'stale product upload directory clearing during deploy env-file loading');
  assertIncludes('scripts/deploy-production.ps1', '"AUTH_DB"', 'stale database name clearing during deploy env-file loading');
  assertIncludes('scripts/deploy-production.ps1', '"FRONTEND_PORT"', 'stale frontend port clearing during deploy env-file loading');
  assertIncludes('scripts/deploy-production.ps1', '"GRAFANA_ADMIN_PASSWORD"', 'stale observability credential clearing during deploy env-file loading');
  assertIncludes('scripts/deploy-production.ps1', '"TRANSACTION_OUTBOX_BATCH_SIZE"', 'stale transaction outbox config clearing during deploy env-file loading');
  assertIncludes('scripts/deploy-production.ps1', '"INVENTORY_API_URL"', 'stale internal service URL clearing during deploy env-file loading');
  assertIncludes('scripts/deploy-production.ps1', '"ALLOW_LOCAL_PRODUCTION_URLS"', 'stale local URL override clearing during deploy env-file loading');
  assertIncludes('scripts/deploy-production.ps1', '"PRODUCTION_COMPOSE_PROFILES"', 'stale active compose profile clearing during deploy env-file loading');
  assertIncludes('scripts/deploy-production.ps1', 'Set-ProcessEnv -Key "PRODUCTION_COMPOSE_PROFILES"', 'active compose profile propagation during deploy validation');
  assertIncludes('scripts/deploy-production.ps1', 'scripts/validate-production-env.js", "--active-profiles", $activeProfilesValue', 'deploy passes active profiles directly to production env validation');
  assertIncludes('scripts/deploy-production.ps1', 'else { "none" }', 'explicit no-profile propagation during deploy validation');
  assertIncludes('scripts/deploy-production.ps1', 'Set-ProcessEnv -Key "API_URL" -Value $env:NEXT_PUBLIC_API_URL', 'deterministic deploy verification API URL derivation');
  assertDoesNotInclude('scripts/deploy-production.ps1', 'Set-DefaultProcessEnv -Key "PRODUCT_PUBLIC_BASE_URL"', 'not default required product public URL during deploy validation');
  assertIncludes('.github/workflows/ci.yml', 'Production migration preflight smoke', 'CI runtime smoke for production migration preflight');
  assertIncludes('.github/workflows/ci.yml', 'Verify PowerShell for production scripts', 'CI verifies PowerShell before production script regression tests');
  assertIncludes('.github/workflows/ci.yml', 'pwsh --version', 'CI requires PowerShell Core for production script regression tests');
  assertIncludes('.github/workflows/ci.yml', "trap 'rm -f .env.ci-preflight' EXIT", 'CI cleanup for temporary production preflight env file');
  assertIncludes('.github/workflows/ci.yml', 'umask 077', 'restricted permissions for temporary CI preflight env file');
  assertIncludes('.github/workflows/ci.yml', 'npm run prod:migrate:preflight -- --env-file .env.ci-preflight', 'CI production migration preflight command');
  assertIncludes('scripts/verify-production.ps1', 'HEALTH_CHECK_RETRIES', 'production verification health retry defaults');
  assertIncludes('scripts/verify-production.ps1', 'npm", "run", "health:check"', 'production health verification');
  assertIncludes('scripts/verify-production.ps1', 'npm", "run", "smoke:test"', 'production smoke verification');
  assertIncludes('scripts/verify-production.ps1', 'npm", "run", "prod:logs:check"', 'production log verification');
  assertIncludes('scripts/verify-production.ps1', 'ConfirmSkipGates', 'explicit skipped-verification confirmation');
  assertIncludes('scripts/verify-production.ps1', '[Environment]::SetEnvironmentVariable($key, $value.Trim', 'deterministic env-file loading during verification');
  assertIncludes('scripts/verify-production.ps1', '[Environment]::SetEnvironmentVariable($key, $null, "Process")', 'clearing stale managed process env during verification env-file loading');
  assertIncludes('scripts/verify-production.ps1', '"SMOKE_ADMIN_ACCESS_TOKEN"', 'stale smoke token clearing during verification env-file loading');
  assertIncludes('scripts/verify-production.ps1', '"PRODUCT_UPLOAD_DIR"', 'stale product upload directory clearing during verification env-file loading');
  assertIncludes('scripts/verify-production.ps1', '"AUTH_DB"', 'stale database name clearing during verification env-file loading');
  assertIncludes('scripts/verify-production.ps1', '"FRONTEND_PORT"', 'stale frontend port clearing during verification env-file loading');
  assertIncludes('scripts/verify-production.ps1', '"GRAFANA_ADMIN_PASSWORD"', 'stale observability credential clearing during verification env-file loading');
  assertIncludes('scripts/verify-production.ps1', '"TRANSACTION_OUTBOX_BATCH_SIZE"', 'stale transaction outbox config clearing during verification env-file loading');
  assertIncludes('scripts/verify-production.ps1', '"INVENTORY_API_URL"', 'stale internal service URL clearing during verification env-file loading');
  assertIncludes('scripts/verify-production.ps1', '"ALLOW_LOCAL_PRODUCTION_URLS"', 'stale local URL override clearing during verification env-file loading');
  assertIncludes('scripts/verify-production.ps1', '"PRODUCTION_COMPOSE_PROFILES"', 'stale active compose profile clearing during verification env-file loading');
  assertIncludes('scripts/verify-production.ps1', '[switch]$WithProxy', 'proxy profile support during production verification');
  assertIncludes('scripts/verify-production.ps1', 'if ($WithProxy) { $activeProfiles += "proxy" }', 'proxy profile propagation during production verification');
  assertIncludes('scripts/verify-production.ps1', 'Set-ProcessEnv -Key "PRODUCTION_COMPOSE_PROFILES"', 'active compose profile propagation during verification validation');
  assertIncludes('scripts/verify-production.ps1', 'scripts/validate-production-env.js", "--active-profiles", $activeProfilesValue', 'verification passes active profiles directly to production env validation');
  assertIncludes('scripts/verify-production.ps1', 'else { "none" }', 'explicit no-profile propagation during verification validation');
  assertIncludes('scripts/verify-production.ps1', 'Set-ProcessEnv -Key "API_URL" -Value $env:NEXT_PUBLIC_API_URL', 'deterministic verification API URL derivation');
  assertDoesNotInclude('scripts/verify-production.ps1', 'Set-DefaultProcessEnv -Key "PRODUCT_PUBLIC_BASE_URL"', 'not default required product public URL during verification');
  assertIncludes('scripts/production-log-check.js', 'OOMKilled', 'OOM-kill container state check');
  assertIncludes('scripts/production-log-check.js', 'LOG_CHECK_STATE_CONTAINERS', 'infra container state checks');
  assertIncludes('scripts/production-log-check.js', 'wms-rabbitmq', 'RabbitMQ state check');
  assertIncludes('scripts/production-log-check.js', 'wms-redis', 'Redis state check');
  assertIncludes('scripts/production-log-check.js', 'wms-auth-service-db', 'database state checks');
  assertIncludes('scripts/run-powershell.js', "commandExists('pwsh')", 'PowerShell runner prefers PowerShell Core');
  assertIncludes('scripts/run-powershell.js', "commandExists('powershell')", 'PowerShell runner supports Windows PowerShell fallback');
  assertIncludes('scripts/production-migration-preflight.js', 'docker', 'Docker Compose production migration preflight');
  assertIncludes('scripts/production-migration-preflight.js', 'auth-service-db', 'auth DB service preflight');
  assertIncludes('scripts/production-migration-preflight.js', 'inventory-service-db', 'inventory DB service preflight');
  assertIncludes('scripts/production-migration-preflight.js', 'transaction-service-db', 'transaction DB service preflight');
  assertIncludes('scripts/production-migration-preflight.js', "args.profiles.push(argv[++i])", 'production migration preflight profile argument parsing');
  assertIncludes('scripts/production-migration-preflight.js', "composeArgs.push('--profile', profile)", 'production migration preflight compose profile propagation');
  assertIncludes('scripts/production-migration-preflight.js', '-SkipMigratePreflight -ConfirmSkipGates', 'first-deploy migration preflight guidance');
  assertIncludes('scripts/production-migration-preflight.js', 'function assertSafePostgresIdentifier', 'production migration preflight validates PostgreSQL identifier syntax');
  assertIncludes('scripts/production-migration-preflight.js', "assertSafePostgresIdentifier('POSTGRES_USER', user)", 'production migration preflight validates PostgreSQL role syntax before Docker exec');
  assertIncludes('scripts/production-migration-preflight.js', 'assertSafePostgresIdentifier(target.databaseEnv, database)', 'production migration preflight validates database names before Docker exec');
  assertIncludes('scripts/production-migration-preflight.js', 'const validatedEnv = validatePreflightEnv(selectedServices, env)', 'production migration preflight validates env before inspecting running DB services');
  assertIncludes('scripts/production-migration-preflight-test.js', 'DOCKER_CALLED', 'runtime regression coverage for pre-Docker migration preflight validation');
  assertIncludes('scripts/production-migration-preflight-test.js', 'POSTGRES_USER=bad user', 'runtime regression coverage for invalid migration preflight PostgreSQL role names');
  assertIncludes('scripts/production-migration-preflight-test.js', 'AUTH_DB=../evil', 'runtime regression coverage for invalid migration preflight database names');
  assertIncludes('scripts/production-backup-restore-validation-test.js', 'backup directory before validating config', 'runtime regression coverage for backup validation before artifact creation');
  assertIncludes('scripts/production-backup-restore-validation-test.js', 'POSTGRES_USER=bad user', 'runtime regression coverage for invalid backup/restore PostgreSQL role names');
  assertIncludes('scripts/production-backup-restore-validation-test.js', 'AUTH_DB=../evil', 'runtime regression coverage for invalid backup/restore database names');
  assertIncludes('scripts/backup-production.ps1', 'status = "IN_PROGRESS"', 'partial-backup manifest state');
  assertIncludes('scripts/backup-production.ps1', 'status = "COMPLETED"', 'completed-backup manifest state');
  assertIncludes('scripts/backup-production.ps1', 'status = "FAILED"', 'failed-backup manifest state');
  assertIncludes('scripts/backup-production.ps1', 'failedAt', 'failed-backup timestamp');
  assertDoesNotInclude('scripts/backup-production.ps1', 'Product upload backup skipped', 'not silently complete backups when product upload copy fails');
  assertDoesNotInclude('scripts/backup-production.ps1', 'skipped = $true', 'not mark product uploads skipped in completed backup manifest');
  assertIncludes('scripts/backup-production.ps1', 'Get-RelativeBackupPath', 'per-file product upload manifest paths');
  assertIncludes('scripts/backup-production.ps1', 'sha256 = $uploadHash.Hash.ToLowerInvariant()', 'per-file product upload checksum recording');
  assertIncludes('scripts/backup-production.ps1', '$productUploadDir', 'backup uses configured product upload directory');
  assertIncludes('scripts/restore-production.ps1', 'ConfirmRestore', 'destructive restore confirmation');
  assertIncludes('scripts/restore-production.ps1', 'Product upload checksum mismatch', 'per-file product upload checksum validation');
  assertIncludes('scripts/restore-production.ps1', 'Unsafe product upload path in manifest', 'product upload manifest path safety validation');
  assertIncludes('scripts/restore-production.ps1', 'Create product upload restore directory failed', 'product upload restore mkdir failure check');
  assertIncludes('scripts/restore-production.ps1', 'Product upload restore copy failed', 'product upload restore copy failure check');
  assertIncludes('scripts/restore-production.ps1', '$productUploadDir', 'restore uses configured product upload directory');
  assertIncludes('scripts/restore-production.ps1', 'Backup manifest postgresUser is', 'restore PostgreSQL role mismatch guard');
  assertIncludes('scripts/restore-production.ps1', 'different database role', 'restore PostgreSQL role mismatch guard');
  assertIncludes('frontend/app/api/runtime-config/route.ts', 'window.__WMS_CONFIG__', 'runtime frontend API config');
  assertIncludes('docker-compose.prod.yml', 'NEXT_PUBLIC_API_URL:?NEXT_PUBLIC_API_URL is required', 'required frontend public API URL in production compose');
  assertIncludes('docker-compose.prod.yml', 'PRODUCT_PUBLIC_BASE_URL:?PRODUCT_PUBLIC_BASE_URL is required', 'required product public base URL in production compose');
  assertIncludes('docker-compose.prod.yml', 'POSTGRES_USER:?POSTGRES_USER is required', 'required PostgreSQL user in production compose');
  assertIncludes('docker-compose.prod.yml', 'product-upload-data:${PRODUCT_UPLOAD_DIR:-/app/uploads/products}', 'product upload volume mounted at configured upload directory');
  assertIncludes('docker-compose.yml', 'redis-cli", "ping"', 'Redis healthcheck');
  assertIncludes('docker-compose.yml', 'redis:', 'Redis service dependency');
  assertIncludes('scripts/validate-production-env.js', "'POSTGRES_USER'", 'required PostgreSQL user validation');
  assertIncludes('scripts/validate-production-env.js', 'COMPOSE_OPTIONAL_KEYS', 'clearing optional production compose env keys during validation');
  assertIncludes('scripts/validate-production-env.js', "'AUTH_DB'", 'clearing stale database names during production env validation');
  assertIncludes('scripts/validate-production-env.js', "'FRONTEND_PORT'", 'clearing stale frontend port during production env validation');
  assertIncludes('scripts/validate-production-env.js', "'TRANSACTION_OUTBOX_BATCH_SIZE'", 'clearing stale transaction outbox config during production env validation');
  assertIncludes('scripts/validate-production-env.js', "'PRODUCTION_COMPOSE_PROFILES'", 'clearing stale active compose profiles during production env validation');
  assertIncludes('scripts/validate-production-env.js', '--active-profiles', 'CLI active profile override for production workflow validation');
  assertIncludes('scripts/validate-production-env.js', 'process.env.PRODUCTION_COMPOSE_PROFILES = cliArgs.activeProfiles', 'production env validation applies workflow active profiles after env-file loading');
  assertIncludes('scripts/validate-production-env.js', 'must not include embedded credentials', 'public production URLs reject embedded credentials');
  assertIncludes('scripts/validate-production-env.js', 'must not include query string or hash fragment', 'public production base URLs reject query strings and hash fragments');
  assertIncludes('scripts/validate-production-env.js', 'function validateInteger', 'integer validation for optional production env values');
  assertIncludes('scripts/validate-production-env.js', 'function validateBoolean', 'boolean validation for optional production env values');
  assertIncludes('scripts/validate-production-env.js', 'function validateDbName', 'database name validation for optional production env values');
  assertIncludes('scripts/validate-production-env.js', 'function validateInternalUrl', 'internal service URL validation for optional production env values');
  assertIncludes('scripts/validate-production-env.js', 'function validateUrlCredentialComponent', 'connection URL credential component validation for production env values');
  assertIncludes('scripts/validate-production-env.js', 'function validatePostgresRoleName', 'PostgreSQL role name validation for production env values');
  assertIncludes('scripts/validate-production-env.js', 'function validateDistinctPorts', 'host port collision validation for production env values');
  assertIncludes('scripts/validate-production-env.js', 'function validateBindHost', 'observability bind host validation for production env values');
  assertIncludes('scripts/validate-production-env.js', 'function getActiveComposeProfiles', 'workflow-aware active compose profile validation');
  assertIncludes('scripts/validate-production-env.js', 'unsupported profile', 'active compose profile allowlist validation');
  assertIncludes('scripts/validate-production-env.js', 'GRAFANA_ADMIN_PASSWORD is required when observability profile is active', 'observability profile credential validation');
  assertIncludes('scripts/validate-production-env.js', 'proxyConfigured || proxyProfileActive', 'proxy profile required settings validation');
  assertIncludes('scripts/validate-production-env.js', 'function isObservabilityConfigured', 'profile-aware observability port validation');
  assertIncludes('scripts/validate-production-env.js', "validatePostgresRoleName('POSTGRES_USER')", 'PostgreSQL role names are validated as PostgreSQL-safe identifiers');
  assertIncludes('scripts/validate-production-env.js', "'POSTGRES_PASSWORD', 'RABBITMQ_DEFAULT_USER'", 'PostgreSQL password and RabbitMQ credentials are validated as URL-safe components');
  assertIncludes('scripts/production-env-validation-test.js', "POSTGRES_USER: 'wms-prod'", 'runtime regression coverage for invalid PostgreSQL role names');
  assertIncludes('package.json', 'test:prod-env', 'production env validation regression test script');
  assertIncludes('package.json', 'test:prod-migrate-preflight', 'production migration preflight regression test script');
  assertIncludes('package.json', 'test:prod-backup-restore', 'production backup/restore validation regression test script');
  assertIncludes('scripts/validate-production-env.js', "validateInteger('TRANSACTION_OUTBOX_BATCH_SIZE'", 'transaction outbox batch size production env validation');
  assertIncludes('scripts/validate-production-env.js', "validateInteger('INVENTORY_TRANSACTION_CONSUMER_PREFETCH'", 'inventory consumer prefetch production env validation');
  assertIncludes('scripts/validate-production-env.js', 'validateDistinctPorts(activeHostPortDefaults)', 'production host port uniqueness validation');
  assertIncludes('scripts/validate-production-env.js', 'if (!proxyProfileActive)', 'frontend host port validation disabled when proxy profile resets frontend ports');
  assertIncludes('scripts/validate-production-env.js', 'if (proxyProfileActive)', 'proxy port collision validation only when proxy profile is active');
  assertIncludes('scripts/validate-production-env.js', 'if (observabilityProfileActive)', 'observability port collision validation only when observability profile is active');
  assertIncludes('scripts/validate-production-env.js', "validateBindHost('OBSERVABILITY_BIND_HOST')", 'observability bind host production env validation');
  assertIncludes('scripts/validate-production-env.js', "validateDuration('PROMETHEUS_RETENTION'", 'Prometheus retention production env validation');
  assertIncludes('scripts/validate-production-env.js', "validateBoolean('ALLOW_LOCAL_PRODUCTION_URLS')", 'local URL override boolean validation');
  assertIncludes('scripts/validate-production-env.js', "validateInternalUrl(key)", 'internal transaction-service dependency URL validation');
  assertIncludes('scripts/backup-production.ps1', 'POSTGRES_USER is required for production backup', 'required PostgreSQL user for backups');
  assertIncludes('scripts/backup-production.ps1', 'function Assert-SafePostgresUser', 'backup validates PostgreSQL role name syntax');
  assertIncludes('scripts/backup-production.ps1', 'Assert-SafePostgresUser -Value $postgresUser', 'backup validates PostgreSQL role before artifact creation');
  assertIncludes('scripts/backup-production.ps1', 'function Import-BackupEnvFile', 'backup env validation before local backup artifact creation');
  assertIncludes('scripts/backup-production.ps1', '[Environment]::SetEnvironmentVariable($key, $value.Trim', 'deterministic env-file loading during backup');
  assertIncludes('scripts/backup-production.ps1', '[Environment]::SetEnvironmentVariable($key, $null, "Process")', 'clearing stale managed process env during backup env-file loading');
  assertIncludes('scripts/backup-production.ps1', 'Assert-SafeContainerPath -Name "PRODUCT_UPLOAD_DIR"', 'backup validates product upload container path');
  assertIncludes('scripts/backup-production.ps1', 'Assert-SafeContainerPath -Name "PRODUCT_UPLOAD_DIR" -Value $rawProductUploadDir', 'backup validates raw product upload container path before normalization');
  assertIncludes('scripts/backup-production.ps1', 'must not be the container root path', 'backup rejects container root as product upload path');
  assertIncludes('scripts/backup-production.ps1', 'must not end with a trailing slash', 'backup rejects trailing slash in product upload path');
  assertIncludes('scripts/backup-production.ps1', 'function Get-SafeDatabaseName', 'backup validates configured database names');
  assertIncludes('scripts/backup-production.ps1', 'Get-SafeDatabaseName -EnvKey "AUTH_DB"', 'backup validates auth database name before artifact creation');
  assertIncludes('scripts/restore-production.ps1', 'POSTGRES_USER is required for production restore', 'required PostgreSQL user for restores');
  assertIncludes('scripts/restore-production.ps1', 'function Assert-SafePostgresUser', 'restore validates PostgreSQL role name syntax');
  assertIncludes('scripts/restore-production.ps1', 'Assert-SafePostgresUser -Value $postgresUser', 'restore validates PostgreSQL role before reading backup files');
  assertIncludes('scripts/restore-production.ps1', '[Environment]::SetEnvironmentVariable($key, $value.Trim', 'deterministic env-file loading during restore');
  assertIncludes('scripts/restore-production.ps1', '[Environment]::SetEnvironmentVariable($key, $null, "Process")', 'clearing stale managed process env during restore env-file loading');
  assertIncludes('scripts/restore-production.ps1', 'Assert-SafeContainerPath -Name "PRODUCT_UPLOAD_DIR"', 'restore validates product upload container path');
  assertIncludes('scripts/restore-production.ps1', 'Assert-SafeContainerPath -Name "PRODUCT_UPLOAD_DIR" -Value $rawProductUploadDir', 'restore validates raw product upload container path before normalization');
  assertIncludes('scripts/restore-production.ps1', 'must not be the container root path', 'restore rejects container root as product upload path');
  assertIncludes('scripts/restore-production.ps1', 'must not end with a trailing slash', 'restore rejects trailing slash in product upload path');
  assertIncludes('scripts/restore-production.ps1', 'function Get-SafeDatabaseName', 'restore validates configured database names');
  assertIncludes('scripts/restore-production.ps1', 'Get-SafeDatabaseName -EnvKey "AUTH_DB"', 'restore validates auth database name before reading backup files');
  assertIncludes('scripts/validate-production-env.js', "process.env[key] = rawValue.replace", 'production env-file values overriding stale process env');
  assertIncludes('scripts/validate-production-env.js', "validateContainerPath('PRODUCT_UPLOAD_DIR')", 'production upload directory path validation');
  assertIncludes('scripts/validate-production-env.js', 'must not be the container root path', 'production upload directory rejects container root path');
  assertIncludes('scripts/validate-production-env.js', 'delete process.env[key]', 'production env-file validation clearing stale managed process env');
  assertIncludes('scripts/validate-production-env.js', 'function isLocalProductionUrlAllowed()', 'local production URL override evaluated after env-file loading');
  assertDoesNotInclude('scripts/validate-production-env.js', 'const ALLOW_LOCAL_URLS = process.env.ALLOW_LOCAL_PRODUCTION_URLS', 'not read ALLOW_LOCAL_PRODUCTION_URLS before env-file loading');
  assertIncludes('ops/caddy/Caddyfile', 'Strict-Transport-Security "max-age=31536000"', 'HSTS header on bundled TLS proxy');
  assertIncludes('ops/caddy/Caddyfile', 'X-Content-Type-Options nosniff', 'content type security header on bundled TLS proxy');

  const prodCompose = read('docker-compose.prod.yml');
  if (/NEXT_PUBLIC_API_URL:-http:\/\/localhost:3000\/api/.test(prodCompose)) {
    fail('docker-compose.prod.yml must not default NEXT_PUBLIC_API_URL to localhost');
  }
  if (/PRODUCT_PUBLIC_BASE_URL:-http:\/\/localhost:3000\/api/.test(prodCompose)) {
    fail('docker-compose.prod.yml must not default PRODUCT_PUBLIC_BASE_URL to localhost');
  }
  if (/POSTGRES_USER:-postgres/.test(prodCompose)) {
    fail('docker-compose.prod.yml must not default POSTGRES_USER to postgres');
  }

  const baseCompose = read('docker-compose.yml');
  if (/redis:\s*\r?\n\s*condition: service_started/.test(baseCompose)) {
    fail('docker-compose.yml must wait for Redis service_healthy, not service_started');
  }
}

function checkRunbooks() {
  const runbooks = [
    'README.md',
    'docs/DEPLOYMENT.md',
    'docs/production-deployment.md',
    'docs/BACKUP_RESTORE.md',
    'docs/rollback-plan.md',
    'docs/TESTING.md',
    'docs/PRODUCTION_NOTES.md',
  ];
  for (const file of runbooks) assertNoMojibake(file);

  assertIncludes('README.md', 'npm run prod:deploy', 'recommended production deploy command');
  assertIncludes('docs/DEPLOYMENT.md', 'npm run prod:deploy', 'recommended production deploy command');
  assertIncludes('docs/DEPLOYMENT.md', 'npm run prod:deploy:dry-run', 'production deploy dry-run command');
  assertIncludes('docs/DEPLOYMENT.md', 'npm run prod:verify', 'production verification command');
  assertIncludes('docs/DEPLOYMENT.md', 'npm run security:audit', 'security audit gate documentation');
  assertIncludes('docs/DEPLOYMENT.md', '`POSTGRES_USER` is used as an unquoted PostgreSQL role identifier', 'PostgreSQL role identifier documentation');
  assertIncludes('docs/DEPLOYMENT.md', 'URL-safe unreserved characters', 'URL-safe connection credential documentation');
  assertIncludes('docs/DEPLOYMENT.md', 'query strings, or hash fragments', 'public URL query/hash restriction documentation');
  assertIncludes('docs/production-deployment.md', 'npm run prod:deploy', 'recommended production deploy command');
  assertIncludes('docs/production-deployment.md', 'npm run prod:deploy:dry-run', 'production deploy dry-run command');
  assertIncludes('docs/production-deployment.md', 'npm run prod:verify', 'production verification command');
  assertIncludes('docs/production-deployment.md', 'npm run security:audit', 'security audit gate documentation');
  assertIncludes('docs/production-deployment.md', '`POSTGRES_USER` is used as an unquoted PostgreSQL role identifier', 'PostgreSQL role identifier documentation');
  assertIncludes('docs/production-deployment.md', 'URL-safe unreserved characters', 'URL-safe connection credential documentation');
  assertIncludes('docs/production-deployment.md', 'query strings, or hash fragments', 'public URL query/hash restriction documentation');
  assertIncludes('docs/BACKUP_RESTORE.md', 'ConfirmRestore', 'restore confirmation documentation');
  assertIncludes('docs/rollback-plan.md', 'ConfirmRestore', 'rollback restore confirmation documentation');
  assertIncludes('docs/TESTING.md', 'npm run test:prod-env', 'production env validation regression test documentation');
  assertIncludes('docs/TESTING.md', 'npm run test:prod-migrate-preflight', 'production migration preflight regression test documentation');
  assertIncludes('docs/TESTING.md', 'npm run test:prod-backup-restore', 'production backup/restore validation regression test documentation');
  assertIncludes('docs/PRODUCTION_NOTES.md', 'PostgreSQL-safe `POSTGRES_USER`', 'production env role validation documentation');
  assertIncludes('docs/PRODUCTION_NOTES.md', 'pre-Docker validation', 'production migration preflight regression documentation');
  assertIncludes('docs/PRODUCTION_NOTES.md', 'backup/restore validation', 'production backup/restore regression documentation');
}

function checkIgnoredLocalArtifacts() {
  const gitignore = read('.gitignore');
  if (!/^backups$/m.test(gitignore)) fail('.gitignore must ignore local backups');
  if (!/^\.env\.\*$/m.test(gitignore)) fail('.gitignore must ignore env files');
  if (!/^!\.env\.production\.example$/m.test(gitignore)) fail('.gitignore must keep .env.production.example tracked');

  const dockerContexts = [
    'frontend',
    'services/api-gateway',
    'services/auth-service',
    'services/product-service',
    'services/inventory-service',
    'services/transaction-service',
    'services/report-service',
  ];
  const requiredDockerIgnorePatterns = ['node_modules', 'dist', '.env', '.env.*', '*.log', 'coverage', '.vscode', '.idea'];
  for (const context of dockerContexts) {
    const file = `${context}/.dockerignore`;
    assertFile(file);
    const dockerignore = read(file);
    for (const pattern of requiredDockerIgnorePatterns) {
      if (!dockerignore.split(/\r?\n/).includes(pattern)) {
        fail(`${file} must ignore ${pattern}`);
      }
    }
  }
}

function parseEnvExample() {
  const env = new Map();
  for (const line of read('.env.production.example').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) env.set(match[1], match[2].trim());
  }
  return env;
}

function checkProductionEnvExample() {
  const env = parseEnvExample();
  const requiredKeys = [
    'NODE_ENV',
    'JWT_SECRET',
    'INTERNAL_GATEWAY_TOKEN',
    'BOOTSTRAP_ADMIN_EMAIL',
    'BOOTSTRAP_ADMIN_PASSWORD',
    'SMOKE_ADMIN_EMAIL',
    'CORS_ORIGIN',
    'NEXT_PUBLIC_API_URL',
    'PRODUCT_PUBLIC_BASE_URL',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'RABBITMQ_DEFAULT_PASS',
    'OBSERVABILITY_BIND_HOST',
    'OBSERVABILITY_EXPOSE_PUBLIC',
  ];

  for (const key of requiredKeys) {
    if (!env.has(key)) fail(`.env.production.example is missing ${key}`);
  }

  for (const key of ['BOOTSTRAP_ADMIN_EMAIL', 'SMOKE_ADMIN_EMAIL']) {
    const value = env.get(key) || '';
    if (/@wms\.local$/i.test(value) || /@localhost$/i.test(value) || value.endsWith('.local')) {
      fail(`.env.production.example must not use local placeholder email for ${key}`);
    }
    if (!/your-company/i.test(value)) {
      fail(`.env.production.example ${key} should be an obvious replace-me production email placeholder`);
    }
  }

  const envExample = read('.env.production.example');
  if (!envExample.includes('POSTGRES_USER is used as an unquoted PostgreSQL role identifier')) {
    fail('.env.production.example must document PostgreSQL role identifier requirements');
  }
  if (!envExample.includes('URL-safe unreserved characters')) {
    fail('.env.production.example must document URL-safe connection credential requirements');
  }
}

function main() {
  checkPackageScripts();
  checkTaskList();
  checkRequiredArtifacts();
  checkRunbooks();
  checkIgnoredLocalArtifacts();
  checkProductionEnvExample();

  for (const message of warnings) console.warn(`[WARN] ${message}`);
  if (failures.length) {
    console.error('Production readiness audit failed:');
    for (const message of failures) console.error(`- ${message}`);
    process.exit(1);
  }

  console.log('[OK] Production readiness audit');
  console.log('[OK] Non-deploy readiness gates are present. T-004 still requires real server access, production secrets, and URL verification before 100%.');
}

main();
