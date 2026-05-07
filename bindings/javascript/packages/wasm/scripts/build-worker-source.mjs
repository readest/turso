// Bundle worker.ts (and its `database-wasm-common` deps) into a single
// self-contained ES module string, then emit `dist/worker-source.js`
// exporting that string. Used by the `./webpack` entry to construct the
// Web Worker from a Blob URL at runtime — sidesteps webpack's
// `new Worker(new URL('./worker.js', import.meta.url))` chunking.

import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');

// Target the lowest-common-denominator browser versions we want to support.
// esbuild lowers any feature not available in ALL listed browsers — so this
// list defines the floor, not the ceiling. Keep parity with the consumer
// app's browserslist (e.g. readest-app uses chrome/edge/firefox 92, safari
// 15.2). Web Workers run in the same JS engine as the host page, so the
// worker target should match.
const result = await build({
  entryPoints: [resolve(pkgRoot, 'worker.ts')],
  bundle: true,
  format: 'esm',
  target: ['chrome92', 'edge92', 'firefox92', 'safari15.2'],
  platform: 'browser',
  write: false,
  legalComments: 'none',
  minify: true,
});

const out = result.outputFiles?.[0];
if (!out) {
  console.error('build-worker-source: esbuild produced no output');
  process.exit(1);
}

const dest = resolve(pkgRoot, 'dist/worker-source.js');
writeFileSync(
  dest,
  `export const workerSource = ${JSON.stringify(out.text)};\n`,
);
console.log(`build-worker-source: wrote ${dest} (${out.text.length} bytes)`);
