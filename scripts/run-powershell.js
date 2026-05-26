const { spawnSync } = require('node:child_process');

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

const script = process.argv[2];
if (!script) {
  console.error('Usage: node scripts/run-powershell.js <script.ps1> [args...]');
  process.exit(2);
}

const powerShell = resolvePowerShell();
if (!powerShell) {
  console.error('PowerShell is required. Install PowerShell Core (pwsh) or run on Windows with Windows PowerShell.');
  process.exit(127);
}

const scriptArgs = process.argv.slice(3);
const args = powerShell === 'powershell'
  ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...scriptArgs]
  : ['-NoProfile', '-File', script, ...scriptArgs];

const result = spawnSync(powerShell, args, {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(typeof result.status === 'number' ? result.status : 1);
