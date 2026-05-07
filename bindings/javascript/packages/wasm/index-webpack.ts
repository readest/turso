// Webpack-friendly entry. Two adjustments over `index-default.ts`:
//
//   1. Init runs lazily on first call, so there's no top-level await —
//      OpenNext's esbuild post-process rejects TLA in non-async chunk
//      wrappers (Cloudflare Workers / Next.js).
//
//   2. The Web Worker is constructed at runtime from a Blob URL whose
//      source is pre-bundled into `worker-source.js` (a small string export)
//      by `scripts/build-worker-source.mjs`. Webpack mis-handles the
//      `new Worker(new URL('./worker.js', import.meta.url))` pattern in
//      chunked environments — the worker chunk's named imports come out as
//      `(void 0)()` at runtime.
//
// The WASM URL pattern itself is unchanged: webpack 5 detects
// `new URL(literal, import.meta.url)` at build time and emits the file as
// a hashed static asset.

import { setupMainThread } from "@tursodatabase/database-wasm-common";
//@ts-ignore generated at build time by scripts/build-worker-source.mjs
import { workerSource } from "./worker-source.js";

interface NapiInit {
  napiModule: any;
  worker: Worker | null;
}

let initPromise: Promise<NapiInit> | null = null;

export function ensureInit(): Promise<NapiInit> {
  if (!initPromise) {
    initPromise = (async () => {
      const wasmUrl = new URL('./turso.wasm32-wasi.wasm', import.meta.url).href;
      const wasmFile = await fetch(wasmUrl).then((res) => res.arrayBuffer());
      let worker: Worker | null = null;
      const napiModule = await setupMainThread(wasmFile, () => {
        const blob = new Blob([workerSource], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        worker = new Worker(url, { name: 'turso-database', type: 'module' });
        worker.addEventListener('error', () => URL.revokeObjectURL(url));
        return worker;
      });
      return { napiModule, worker };
    })();
  }
  return initPromise;
}
