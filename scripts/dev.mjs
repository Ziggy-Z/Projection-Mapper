#!/usr/bin/env node
/**
 * Dev launcher: Vite dev server + tsc watch on the main process + Electron.
 * Deliberately dependency-free (no concurrently / wait-on) to keep this
 * project's install small.
 *
 *   npm run dev
 *
 * Electron restarts automatically when anything under electron/ recompiles;
 * the renderer hot-reloads through Vite as usual.
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'vite';
import electron from 'electron';
import { markCommonJs } from './cjs-marker.mjs';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const vite = await createServer({ server: { port: 5173 } });
await vite.listen();
const { port } = vite.httpServer.address();
const url = `http://localhost:${port}`;
vite.printUrls();

// Compile the main process once before the first launch, then keep watching.
const tscOnce = spawn(npx, ['tsc', '-p', 'electron/tsconfig.json'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
const [code] = await once(tscOnce, 'exit');
if (code !== 0) {
  await vite.close();
  process.exit(code ?? 1);
}
markCommonJs();

const tscWatch = spawn(
  npx,
  ['tsc', '-p', 'electron/tsconfig.json', '--watch', '--preserveWatchOutput'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

let child = null;
let restarting = false;

function launch() {
  child = spawn(electron, ['dist-electron/electron/main.js'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });
  child.on('exit', (exitCode) => {
    child = null;
    if (restarting) return;
    void shutdown(exitCode ?? 0);
  });
}

async function shutdown(exitCode) {
  tscWatch.kill();
  if (child) {
    restarting = true;
    child.kill();
  }
  await vite.close();
  process.exit(exitCode);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

// Restart Electron when the compiled main process changes.
const { watch } = await import('node:fs');
let debounce;
watch('dist-electron', { recursive: true }, () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (!child) return;
    restarting = true;
    child.once('exit', () => {
      restarting = false;
      launch();
    });
    child.kill();
  }, 250);
});

launch();
