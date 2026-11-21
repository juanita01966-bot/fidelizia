import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { run as runNodeTest } from 'node:test';
import { spec } from 'node:test/reporters';
import { E2E_ENV_DEFAULTS, createTestCryptoFixtures } from './lib/fixtures.mjs';
import { startSupabaseMock } from './lib/supabase-mock.mjs';
import { startWalletMocks } from './lib/wallet-mocks.mjs';

const TESTS_E2E_DIR = path.resolve(import.meta.dirname);
const WORKSPACE_ROOT = path.resolve(TESTS_E2E_DIR, '..', '..');

function printHelp() {
  console.log(`Fidelizia E2E Test Runner

Usage:
  node tests/e2e/run-e2e.mjs [options]

Options:
  --tier=<name>       Select test tier: harness | 1 | 2 | 3 | 4 | visual | all (default: all)
  --self-test         Alias for --tier=harness (runs fast self-contained harness verification)
  --base-url=<url>    Attach to an already-running Fidelizia server instead of booting Next.js
  --mode=<dev|start>  Next.js launch mode when booting locally (default: dev)
  --file=<pattern>    Filter test files by substring match
  --verbose           Stream Next.js child stdout/stderr to console
  --help, -h          Show this help message and exit 0
`);
}

function parseArgs(argv) {
  const opts = {
    tier: 'all',
    baseUrl: process.env.FIDELIZIA_E2E_BASE_URL || '',
    mode: 'dev',
    file: '',
    verbose: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--self-test') {
      opts.tier = 'harness';
    } else if (arg === '--verbose') {
      opts.verbose = true;
    } else if (arg.startsWith('--tier=')) {
      opts.tier = arg.slice('--tier='.length).trim();
    } else if (arg.startsWith('--base-url=')) {
      opts.baseUrl = arg.slice('--base-url='.length).trim();
    } else if (arg.startsWith('--mode=')) {
      opts.mode = arg.slice('--mode='.length).trim();
    } else if (arg.startsWith('--file=')) {
      opts.file = arg.slice('--file='.length).trim();
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  const validTiers = new Set(['harness', '1', '2', '3', '4', 'visual', 'all']);
  if (!validTiers.has(opts.tier)) {
    throw new Error(`Invalid --tier="${opts.tier}". Expected one of: ${Array.from(validTiers).join(', ')}`);
  }
  if (!['dev', 'start'].includes(opts.mode)) {
    throw new Error(`Invalid --mode="${opts.mode}". Expected "dev" or "start".`);
  }
  return opts;
}

function discoverTestFiles(tier, fileFilter) {
  const allEntries = fs
    .readdirSync(TESTS_E2E_DIR)
    .filter((f) => f.endsWith('.test.mjs'))
    .sort();

  const matchesTier = (name) => {
    if (tier === 'harness') return name === 'harness.test.mjs';
    if (tier === '1') return name.startsWith('tier1-');
    if (tier === '2') return name.startsWith('tier2-');
    if (tier === '3') return name.startsWith('tier3-');
    if (tier === '4') return name.startsWith('tier4-');
    if (tier === 'visual') return name === 'visual-checklist.test.mjs';
    return true; // 'all'
  };

  return allEntries
    .filter(matchesTier)
    .filter((name) => (!fileFilter ? true : name.includes(fileFilter)))
    .map((name) => path.join(TESTS_E2E_DIR, name));
}

function allocateEphemeralPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function killChildProcess(child) {
  if (!child || child.exitCode !== null) return;
  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (child.exitCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore
    }
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
    }
  }
}

async function waitForServerReady(baseUrl, child, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  const targets = [`${baseUrl}/api/health`, `${baseUrl}/`];

  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`Next.js server exited prematurely with code ${child.exitCode}`);
    }
    for (const url of targets) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.status < 500) return;
      } catch {
        // retry
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting ${timeoutMs}ms for Next.js server at ${baseUrl}`);
}

async function startManagedEnvironment(mode, verbose) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelizia-e2e-run-'));
  const stateFile = path.join(tmpDir, 'supabase-state.json');
  const cryptoFixtures = createTestCryptoFixtures();

  const supabaseMock = await startSupabaseMock({ stateFile });
  const walletMocks = await startWalletMocks({
    googlePublicKeyPem: cryptoFixtures.googlePublicKeyPem,
  });

  const appPort = await allocateEphemeralPort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const nextBin = path.join(WORKSPACE_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  const interceptorPath = path
    .join(TESTS_E2E_DIR, 'lib', 'wallet-network-interceptor.cjs')
    .replace(/\\/g, '/');

  const existingNodeOpts = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : '';
  const nextEnv = {
    ...process.env,
    NODE_ENV: mode === 'start' ? 'production' : 'development',
    NODE_OPTIONS: `${existingNodeOpts}--require ${interceptorPath}`,
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_APP_URL: baseUrl,
    NEXT_PUBLIC_SUPABASE_URL: supabaseMock.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseMock.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: supabaseMock.serviceRoleKey,
    SESSION_SECRET: E2E_ENV_DEFAULTS.SESSION_SECRET,
    AUTH_SESSION_SECRET: E2E_ENV_DEFAULTS.SESSION_SECRET,
    GOOGLE_ISSUER_ID: cryptoFixtures.google.issuerId,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: cryptoFixtures.google.serviceAccountEmail,
    GOOGLE_PRIVATE_KEY: cryptoFixtures.googlePrivateKeyEscaped,
    APPLE_PASS_TYPE_ID: cryptoFixtures.apple.passTypeId,
    APPLE_TEAM_ID: cryptoFixtures.apple.teamId,
    APPLE_WEB_SERVICE_SECRET: cryptoFixtures.apple.webServiceSecret,
    APPLE_WWDR_CERT_BASE64: cryptoFixtures.appleWwdrCertBase64,
    APPLE_SIGNER_CERT_BASE64: cryptoFixtures.appleSignerCertBase64,
    APPLE_SIGNER_KEY_BASE64: cryptoFixtures.appleSignerKeyBase64,
    FIDELIZIA_E2E_GOOGLE_WALLET_MOCK_URL: walletMocks.googleUrl,
    FIDELIZIA_E2E_GOOGLE_OAUTH_MOCK_URL: walletMocks.googleUrl,
    FIDELIZIA_E2E_APPLE_APNS_MOCK_URL: walletMocks.apnsUrl,
  };

  if (mode === 'start') {
    const buildRes = spawnSync(process.execPath, [nextBin, 'build'], {
      cwd: WORKSPACE_ROOT,
      env: nextEnv,
      stdio: verbose ? 'inherit' : 'pipe',
    });
    if (buildRes.status !== 0) {
      throw new Error(`next build failed with exit code ${buildRes.status}`);
    }
  }

  let nextChild = null;
  function spawnNext() {
    const child = spawn(
      process.execPath,
      [nextBin, mode, '-p', String(appPort), '-H', '127.0.0.1'],
      {
        cwd: WORKSPACE_ROOT,
        env: nextEnv,
        stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }
    );
    if (!verbose && child.stderr) {
      child.stderr.on('data', () => {});
    }
    if (!verbose && child.stdout) {
      child.stdout.on('data', () => {});
    }
    return child;
  }

  nextChild = spawnNext();
  await waitForServerReady(baseUrl, nextChild);

  const controlServer = http.createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && pathname === '/status') {
      const payload = JSON.stringify({
        baseUrl,
        supabaseUrl: supabaseMock.url,
        walletMockUrl: walletMocks.googleUrl,
        apnsMockUrl: walletMocks.apnsUrl,
        nextPid: nextChild?.pid || null,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(payload);
      return;
    }
    if (req.method === 'POST' && pathname === '/restart-server') {
      await killChildProcess(nextChild);
      nextChild = spawnNext();
      await waitForServerReady(baseUrl, nextChild);
      const payload = JSON.stringify({ restarted: true, baseUrl, nextPid: nextChild.pid });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(payload);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise((resolve, reject) => {
    controlServer.once('error', reject);
    controlServer.listen(0, '127.0.0.1', () => resolve());
  });
  const ctrlAddr = controlServer.address();
  const controlUrl = `http://127.0.0.1:${typeof ctrlAddr === 'object' && ctrlAddr ? ctrlAddr.port : 0}`;

  // Coordination env vars for test files (never set NODE_OPTIONS on runner itself)
  process.env.FIDELIZIA_E2E_BASE_URL = baseUrl;
  process.env.FIDELIZIA_E2E_SUPABASE_URL = supabaseMock.url;
  process.env.FIDELIZIA_E2E_SUPABASE_ADMIN_URL = `${supabaseMock.url}/__admin`;
  process.env.FIDELIZIA_E2E_SUPABASE_ANON_KEY = supabaseMock.anonKey;
  process.env.FIDELIZIA_E2E_SUPABASE_SERVICE_ROLE_KEY = supabaseMock.serviceRoleKey;
  process.env.FIDELIZIA_E2E_WALLET_MOCK_URL = walletMocks.googleUrl;
  process.env.FIDELIZIA_E2E_APNS_MOCK_URL = walletMocks.apnsUrl;
  process.env.FIDELIZIA_E2E_CONTROL_URL = controlUrl;

  return {
    baseUrl,
    async cleanup() {
      if (typeof controlServer.closeAllConnections === 'function') {
        controlServer.closeAllConnections();
      }
      await new Promise((resolve) => controlServer.close(() => resolve()));
      await killChildProcess(nextChild);
      await walletMocks.close();
      await supabaseMock.close();
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exitCode = 0;
    return;
  }

  const files = discoverTestFiles(opts.tier, opts.file);
  if (files.length === 0) {
    console.error(`No E2E test files matched --tier=${opts.tier}${opts.file ? ` --file=${opts.file}` : ''}`);
    process.exitCode = 1;
    return;
  }

  let envHandle = null;
  try {
    const needsSutBoot = opts.tier !== 'harness' && !opts.baseUrl;
    if (needsSutBoot) {
      envHandle = await startManagedEnvironment(opts.mode, opts.verbose);
    } else if (opts.baseUrl) {
      process.env.FIDELIZIA_E2E_BASE_URL = opts.baseUrl;
    }

    let aggregateSummary = null;
    const stream = runNodeTest({
      files,
      concurrency: false,
    });

    stream.on('test:summary', (summary) => {
      if (summary.file === undefined) {
        aggregateSummary = summary;
      }
    });

    const formatted = stream.compose(spec);
    formatted.pipe(process.stdout);

    await new Promise((resolve, reject) => {
      stream.once('end', resolve);
      stream.once('error', reject);
    });

    const counts = aggregateSummary?.counts || {};
    const passed = counts.passed ?? 0;
    const failed = counts.failed ?? 0;
    const total = counts.tests ?? 0;
    const duration = Math.round(aggregateSummary?.duration_ms ?? 0);
    console.log(
      `\nE2E Summary [tier=${opts.tier}]: ${passed}/${total} passed, ${failed} failed (${duration}ms)`
    );

    process.exitCode = aggregateSummary?.success ? 0 : 1;
  } finally {
    if (envHandle) {
      await envHandle.cleanup();
    }
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((err) => {
    console.error('[run-e2e] Fatal error:', err);
    process.exitCode = 1;
  });
}
