const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const trackedPostcssAdvisory = 'https://github.com/advisories/GHSA-qx2v-qp2m-jg93';

function run(args) {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', ['npm', ...args].join(' ')], { cwd: root, encoding: 'utf8' });
  }
  return spawnSync('npm', args, { cwd: root, encoding: 'utf8' });
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function parseAudit() {
  const result = run(['audit', '--omit=dev', '--workspaces', '--include-workspace-root', '--json']);
  if (result.error) throw result.error;
  const output = result.stdout || result.stderr || '';
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`Could not parse npm audit JSON: ${error.message}\n${output.slice(0, 500)}`);
  }
}

function getNextVersions() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf8'));
  const installed = pkg.dependencies?.next;
  const latestResult = run(['view', 'next', 'version']);
  if (latestResult.error) throw latestResult.error;
  if (latestResult.status !== 0) {
    throw new Error(`Could not query latest Next.js version: ${(latestResult.stderr || latestResult.stdout).trim()}`);
  }
  return { installed, latest: latestResult.stdout.trim() };
}

function isTrackedNextPostcssIssue(vulnerabilities) {
  const names = Object.keys(vulnerabilities).sort();
  if (names.join(',') !== 'next,postcss') return false;

  const next = vulnerabilities.next;
  const postcss = vulnerabilities.postcss;
  const advisory = (postcss.via || []).find((item) => item && typeof item === 'object' && item.url === trackedPostcssAdvisory);
  const nextViaPostcss = Array.isArray(next.via) && next.via.includes('postcss');
  const fixIsBreakingDowngrade = postcss.fixAvailable?.name === 'next'
    && postcss.fixAvailable?.isSemVerMajor === true
    && next.fixAvailable?.name === 'next'
    && next.fixAvailable?.isSemVerMajor === true;

  return Boolean(advisory && nextViaPostcss && fixIsBreakingDowngrade);
}

function main() {
  const audit = parseAudit();
  const vulnerabilities = audit.vulnerabilities || {};
  const names = Object.keys(vulnerabilities);
  if (!names.length) {
    console.log('[OK] Production npm audit has no advisories');
    return;
  }

  const { installed, latest } = getNextVersions();
  if (isTrackedNextPostcssIssue(vulnerabilities) && installed === latest) {
    console.log(`[WARN] Tracked Next.js/PostCSS advisory remains. Next latest is still ${latest}; npm audit fix proposes a breaking downgrade. See docs/PRODUCTION_NOTES.md.`);
    return;
  }

  if (isTrackedNextPostcssIssue(vulnerabilities) && installed !== latest) {
    fail(`Next.js latest is ${latest}, but frontend uses ${installed}. Review and update Next.js before accepting the tracked PostCSS advisory.`);
    return;
  }

  fail(`Unexpected production npm audit advisories: ${names.join(', ')}`);
}

try {
  main();
} catch (error) {
  fail(error.message);
}
