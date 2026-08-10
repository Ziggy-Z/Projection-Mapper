#!/usr/bin/env node
/** Compiles the Electron main process and marks the output as CommonJS. */

import { spawnSync } from 'node:child_process';
import { markCommonJs } from './cjs-marker.mjs';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const { status } = spawnSync(npx, ['tsc', '-p', 'electron/tsconfig.json'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (status !== 0) process.exit(status ?? 1);

markCommonJs();
