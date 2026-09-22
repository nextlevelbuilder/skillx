/**
 * The version the CLI reports must be the version that was published.
 *
 * These tests run against the source, where the module sits at `src/version.ts`.
 * They cannot prove the bundled case, because bundling moves the module into
 * `dist/index.js`; the published resolution is verified by running the built CLI
 * (`node dist/index.js --version`). What they do pin is that the value comes from
 * the manifest rather than from a literal that drifts on every release.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCliVersion } from "./version.js";

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as { version: string };

describe("readCliVersion", () => {
  it("returns the version declared in package.json", () => {
    expect(readCliVersion()).toBe(manifest.version);
  });

  it("returns a semver, not a placeholder", () => {
    expect(readCliVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("is not the stale literal that issue #24 reported", () => {
    // The old hardcoded value; if this reappears, the fix has been reverted.
    expect(readCliVersion()).not.toBe("0.1.2");
  });

  it("shares the manifest's major version, so a bump cannot go unnoticed", () => {
    expect(readCliVersion().split(".")[0]).toBe(manifest.version.split(".")[0]);
  });
});
