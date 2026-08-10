import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * The root package.json is `"type": "module"` for the Vite side, which would
 * make Node read the main process's compiled .js files as ES modules and fail
 * on `exports is not defined`. A nested package.json scopes the compiled tree
 * back to CommonJS, which is also what a sandboxed preload requires.
 */
export function markCommonJs(dir = 'dist-electron') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/package.json`, `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
}
