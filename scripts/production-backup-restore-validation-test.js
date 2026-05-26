const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function commandExists(command) {
  const probe = process.platform === 'win32'
    ? spawnSync('where.exe', [command], { encoding: 'utf8' })
    : spawnSync('sh', ['-c', `command -v ${command}`], { encoding: 'utf8' });
  return probe.status === 0;
}

function resolvePowerShell() {
  if (commandExists('pwsh')) return 'pwsh';
  if (commandExists('powershell')) return 'powershell';
  return null;
}

const powerShell = resolvePowerShell();
if (!powerShell) {
  console.log('[SKIP] production backup/restore validation test requires PowerShell or pwsh');
  process.exit(0);
}

function writeEnvFile(name, lines) {
  const file = path.join(os.tmpdir(), `wms-${name}-${process.pid}.env`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  return file;
}

function runPowerShell(args) {
  const executableArgs = powerShell === 'powershell'
    ? ['-ExecutionPolicy', 'Bypass', ...args]
    : args;
  return spawnSync(powerShell, executableArgs, {
    cwd: root,
    encoding: 'utf8',
  });
}

function expectFailure(name, result, expectedMessage) {
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status === 0) {
    process.stdout.write(output);
    throw new Error(`${name} expected command to fail`);
  }
  if (!output.includes(expectedMessage)) {
    process.stdout.write(output);
    throw new Error(`${name} failed with an unexpected message`);
  }
  if (/docker\s|pg_dump|psql/i.test(output)) {
    process.stdout.write(output);
    throw new Error(`${name} reached Docker/PostgreSQL work before config validation`);
  }
  console.log(`[OK] ${name}`);
}

function testBackupRejectsInvalidEnv(name, envLines, expectedMessage) {
  const envFile = writeEnvFile(name, envLines);
  const backupDir = path.join(os.tmpdir(), `wms-${name}-backup-${process.pid}`);
  try {
    const result = runPowerShell(['-File', 'scripts/backup-production.ps1', '-EnvFile', envFile, '-BackupDir', backupDir]);
    expectFailure(name, result, expectedMessage);
    if (fs.existsSync(backupDir)) throw new Error(`${name} created a backup directory before validating config`);
  } finally {
    fs.rmSync(envFile, { force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
}

function testRestoreRejectsInvalidEnv(name, envLines, expectedMessage) {
  const envFile = writeEnvFile(name, envLines);
  const backupPath = fs.mkdtempSync(path.join(os.tmpdir(), `wms-${name}-restore-${process.pid}-`));
  try {
    const result = runPowerShell(['-File', 'scripts/restore-production.ps1', '-BackupPath', backupPath, '-EnvFile', envFile, '-DryRun']);
    expectFailure(name, result, expectedMessage);
  } finally {
    fs.rmSync(envFile, { force: true });
    fs.rmSync(backupPath, { recursive: true, force: true });
  }
}

testBackupRejectsInvalidEnv(
  'production-backup-rejects-bad-postgres-user-before-artifacts',
  ['POSTGRES_USER=bad user'],
  'POSTGRES_USER must be a PostgreSQL role name',
);

testRestoreRejectsInvalidEnv(
  'production-restore-rejects-bad-postgres-user-before-reading-backup',
  ['POSTGRES_USER=bad user'],
  'POSTGRES_USER must be a PostgreSQL role name',
);

testBackupRejectsInvalidEnv(
  'production-backup-rejects-bad-auth-db-before-artifacts',
  ['POSTGRES_USER=wms_prod', 'AUTH_DB=../evil'],
  'AUTH_DB must be a PostgreSQL database name',
);

testRestoreRejectsInvalidEnv(
  'production-restore-rejects-bad-auth-db-before-reading-backup',
  ['POSTGRES_USER=wms_prod', 'AUTH_DB=../evil'],
  'AUTH_DB must be a PostgreSQL database name',
);
