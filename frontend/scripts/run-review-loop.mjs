#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const playwrightBin = path.join(frontendRoot, 'node_modules', '.bin', 'playwright');
const frontendBaseUrl = 'http://127.0.0.1:3100';

function parseArgs(argv) {
  const options = { passthrough: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith('--')) {
      options.passthrough.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return options;
}

function runStep(command, args, env = process.env) {
  console.log(`[review:loop] exec: ${command} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env,
      cwd: frontendRoot,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code && code !== 0) {
        process.exit(code);
      }
      resolve();
    });
  });
}

function printUsage() {
  console.log(`
Usage:
  npm run review:loop -- [--fixture transformer-review]
  npm run review:loop -- --paper-id PAPER_ID --slug fixture-name [--api http://127.0.0.1:8000]

Options:
  --fixture           Existing fixture slug to review. Default: transformer-review
  --paper-id          Generate a live fixture before running Playwright
  --slug              Output slug for the generated live fixture
  --api               Backend API base URL. Default: http://127.0.0.1:8000
  --label             Label for generated fixture
  --description       Description for generated fixture
  --max-papers        Max papers for live fixture generation
  --expand-id         Optional expand target for live fixture generation
  --update-snapshots  Pass through to Playwright
`);
}

async function isServerReachable(url) {
  try {
    const response = await fetch(`${url}/review`, { redirect: 'manual' });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(url, timeoutMs = 45_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReachable(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
}

async function ensureFrontendServer() {
  if (await isServerReachable(frontendBaseUrl)) {
    console.log('[review:loop] using existing frontend dev server');
    return null;
  }

  console.log('[review:loop] starting frontend dev server');
  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', '3100'],
    {
      stdio: 'inherit',
      env: process.env,
      cwd: frontendRoot,
    }
  );

  const ready = await waitForServer(frontendBaseUrl);
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error('Frontend dev server did not become ready within 45s');
  }

  console.log('[review:loop] frontend dev server ready');
  return child;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.h) {
    printUsage();
    process.exit(0);
  }

  let fixtureSlug = options.fixture || 'transformer-review';

  if (options['paper-id'] || options.slug) {
    if (!options['paper-id'] || !options.slug) {
      printUsage();
      process.exit(1);
    }

    const generatorArgs = [
      './scripts/generate-live-review-fixture.mjs',
      '--paper-id',
      options['paper-id'],
      '--slug',
      options.slug,
    ];

    const forwardableKeys = ['api', 'label', 'description', 'max-papers', 'expand-id'];
    for (const key of forwardableKeys) {
      if (options[key]) {
        generatorArgs.push(`--${key}`, String(options[key]));
      }
    }

    console.log(`[review:loop] generating live fixture "${options.slug}"`);
    await runStep('node', generatorArgs);
    fixtureSlug = options.slug;
  }

  const playwrightArgs = ['test', '-c', 'playwright.config.ts'];
  if (options['update-snapshots']) {
    playwrightArgs.push('--update-snapshots');
  }

  const reviewRunId = new Date().toISOString().replace(/[:.]/g, '-');
  const frontendServer = await ensureFrontendServer();

  try {
    console.log(`[review:loop] running Playwright with fixture "${fixtureSlug}"`);
    await runStep(playwrightBin, playwrightArgs, {
      ...process.env,
      PLAYWRIGHT_SKIP_WEBSERVER: '1',
      REVIEW_FIXTURE: fixtureSlug,
      REVIEW_RUN_ID: reviewRunId,
    });

    console.log(`[review:loop] complete`);
    console.log(`[review:loop] reviewed fixture: ${fixtureSlug}`);
    console.log(`[review:loop] screenshots: frontend/test-results/${fixtureSlug}-${reviewRunId}/`);
  } finally {
    if (frontendServer) {
      frontendServer.kill('SIGTERM');
    }
  }
}

main().catch((error) => {
  console.error('[review:loop] failed');
  console.error(error);
  process.exit(1);
});
