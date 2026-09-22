/**
 * The CLI's own version, read from `package.json` at runtime.
 *
 * A hardcoded string is what let `skillx --version` print `0.1.2` while npm
 * published `0.4.0` (issue #24). release-please bumps `package.json` only, so any
 * literal in source drifts silently on every release; reading the real file makes
 * the reported version the published version by construction.
 *
 * DEPTH IS LOAD-BEARING. `../package.json` is resolved against this module's own
 * URL, and the module is inlined into the bundle:
 *   - in development and in tests the module is `src/version.ts`;
 *   - in the published package it is inlined into `dist/index.js`.
 * Both sit exactly one level below the package root, so one relative path serves
 * both. A helper under `src/lib/` would be two levels deep and would break after
 * bundling, where it lands one level up — which is why this file lives beside the
 * entry point rather than with the other helpers. `version.test.ts` pins the
 * development resolution; the bundle is verified by running the built CLI.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PACKAGE_JSON_URL = new URL("../package.json", import.meta.url);

/**
 * Returns the package version, or `"unknown"` when it cannot be read.
 *
 * A missing or malformed manifest must not stop the CLI from running: reporting
 * an unknown version is a small problem, refusing to start is a large one.
 */
export function readCliVersion(): string {
  try {
    const raw = readFileSync(fileURLToPath(PACKAGE_JSON_URL), "utf8");
    const parsed: unknown = JSON.parse(raw);
    const version = (parsed as { version?: unknown } | null)?.version;
    return typeof version === "string" && version.trim() !== "" ? version : "unknown";
  } catch (error) {
    console.error("skillx: could not read the package version:", error);
    return "unknown";
  }
}
