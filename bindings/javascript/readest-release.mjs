#!/usr/bin/env node
// Apply the readest fork's release-time transforms to bindings/javascript/.
// Run from a clean working tree, then `yarn build && yarn publish` per package.
// Revert with `git checkout -- bindings/javascript/` afterwards.
//
// Usage:
//   node bindings/javascript/readest-release.mjs            # rev = 0
//   READEST_REV=1 node bindings/javascript/readest-release.mjs
//   node bindings/javascript/readest-release.mjs --rev 2

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const JS_ROOT = dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = join(JS_ROOT, "packages");

const NAME_MAP = {
  "@tursodatabase/database-wasm32-wasi": "@readest/turso-database-wasm32-wasi",
  "@tursodatabase/database-wasm-common":  "@readest/turso-database-wasm-common",
  "@tursodatabase/database-wasm":         "@readest/turso-database-wasm",
  "@tursodatabase/database-common":       "@readest/turso-database-common",
};

// Per-package release config. Anything not listed gets the name rename only.
//   suffix:   append to version, e.g. "0.6.0-pre.28" -> "0.6.0-pre.28-readest.0"
//   pinDeps:  list of dep names whose version becomes exact (drop the "^") and
//             gets the readest suffix
//   extraDeps: deps to add (value "__VERSION__" expands to the suffixed version)
const PACKAGE_CONFIG = {
  common:      { suffix: true },
  "wasm-common": {
    suffix: true,
    extraDeps: { "@readest/turso-database-common": "__VERSION__" },
  },
  wasm: {
    suffix: true,
    pinDeps: [
      "@readest/turso-database-common",
      "@readest/turso-database-wasm-common",
    ],
  },
  native: {}, // rename only, no version bump, no dep pinning
};

// File extensions we walk for global string replacement.
const TEXT_EXTS = new Set([".json", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".md"]);

function parseArgs() {
  const argv = process.argv.slice(2);
  let rev = process.env.READEST_REV ?? "0";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--rev") rev = argv[++i];
  }
  if (!/^\d+$/.test(rev)) {
    throw new Error(`--rev must be a non-negative integer, got: ${rev}`);
  }
  return { rev };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function applyNameRenames(files) {
  // Apply longest keys first so substrings don't shadow longer matches.
  const entries = Object.entries(NAME_MAP).sort((a, b) => b[0].length - a[0].length);
  let touched = 0;
  for (const path of files) {
    const ext = path.slice(path.lastIndexOf("."));
    if (!TEXT_EXTS.has(ext)) continue;
    const orig = readFileSync(path, "utf8");
    let next = orig;
    for (const [from, to] of entries) {
      next = next.split(from).join(to);
    }
    if (next !== orig) {
      writeFileSync(path, next);
      touched++;
    }
  }
  return touched;
}

function rewritePackageJson(pkgDir, cfg, readestVersion) {
  const path = join(pkgDir, "package.json");
  const pkg = readJson(path);
  let baseVersion = pkg.version;
  // Strip any pre-existing readest suffix so the script is idempotent.
  baseVersion = baseVersion.replace(/-readest\.\d+$/, "");
  const fullVersion = `${baseVersion}-readest.${readestVersion}`;

  if (cfg.suffix) pkg.version = fullVersion;

  if (cfg.pinDeps && pkg.dependencies) {
    for (const dep of cfg.pinDeps) {
      if (dep in pkg.dependencies) {
        pkg.dependencies[dep] = fullVersion;
      }
    }
  }

  if (cfg.extraDeps) {
    pkg.dependencies ??= {};
    for (const [dep, ver] of Object.entries(cfg.extraDeps)) {
      pkg.dependencies[dep] = ver === "__VERSION__" ? fullVersion : ver;
    }
  }

  writeJson(path, pkg);
}

function main() {
  const { rev } = parseArgs();

  // Phase 1: global name rename across all text files under packages/.
  const allFiles = walk(PACKAGES_DIR);
  const touched = applyNameRenames(allFiles);
  console.log(`renamed package refs in ${touched} file(s)`);

  // Phase 2: per-package package.json surgery (version bump, dep pin, extra deps).
  for (const [name, cfg] of Object.entries(PACKAGE_CONFIG)) {
    const pkgDir = join(PACKAGES_DIR, name);
    try {
      statSync(join(pkgDir, "package.json"));
    } catch {
      console.warn(`skip: ${name}/package.json not found`);
      continue;
    }
    rewritePackageJson(pkgDir, cfg, rev);
    console.log(`updated ${name}/package.json`);
  }

  console.log(`\nreadest rev: ${rev}`);
  console.log("review with: git diff bindings/javascript");
  console.log("revert with: git checkout -- bindings/javascript");
}

main();
