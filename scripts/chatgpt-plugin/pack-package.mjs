/**
 * Builds the ZIP the OpenAI plugin portal accepts: the package files at the
 * archive root, nothing else. Validation runs first and a failing package is
 * never packed. File order and timestamps are fixed, so the same sources give
 * the same archive bytes.
 *
 * Usage: node scripts/chatgpt-plugin/pack-package.mjs [packageDir] [outDir]
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { validatePackage } from "./validate-package.mjs";

const FIXED_TIME = new Date("2026-01-01T00:00:00Z");

function listFiles(dir, root = dir) {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? listFiles(path, root) : [relative(root, path)];
    })
    .sort();
}

const dir = resolve(process.argv[2] ?? "integrations/chatgpt-plugin");
const outDir = resolve(process.argv[3] ?? "dist/chatgpt-plugin");
const { errors, pending, manifest } = validatePackage(dir);
if (errors.length > 0) {
  for (const line of errors) console.error(`error: ${line}`);
  process.exit(1);
}

// Timestamps are fixed on a staging copy, so packing never touches the sources.
const stage = mkdtempSync(join(tmpdir(), "skillx-chatgpt-plugin-"));
const files = listFiles(dir);
mkdirSync(outDir, { recursive: true });
const zipPath = join(outDir, `${manifest.name}-${manifest.version}.zip`);
try {
  cpSync(dir, stage, { recursive: true });
  for (const file of files) utimesSync(join(stage, file), FIXED_TIME, FIXED_TIME);
  rmSync(zipPath, { force: true });
  // -X drops extra attributes, -D omits directory entries: only the files themselves.
  execFileSync("zip", ["-X", "-D", "-q", zipPath, ...files], { cwd: stage, env: { ...process.env, TZ: "UTC" } });
} finally {
  rmSync(stage, { recursive: true, force: true });
}

for (const line of pending) console.log(`pending: ${line}`);
console.log(`packed ${files.length} files into ${relative(process.cwd(), zipPath)}`);
