import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regression test for issue #24: the CLI reported a hardcoded version (`0.1.2`) that had
 * drifted from `package.json` (`0.4.0`). The assertion below builds the real binary and
 * compares its output with the manifest, so a re-hardcoded or stale version fails the suite.
 */
const CLI_DIR = fileURLToPath(new URL("..", import.meta.url));
const BINARY = join(CLI_DIR, "dist", "index.js");
const MANIFEST = join(CLI_DIR, "package.json");

function manifestVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { version?: string };
    if (!manifest.version) throw new Error("package.json has no version field");
    return manifest.version;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read the CLI version from ${MANIFEST}: ${detail}`);
  }
}

describe("cli --version", () => {
  it("reports the version declared in package.json", () => {
    execFileSync("pnpm", ["build"], { cwd: CLI_DIR, stdio: "pipe" });

    const output = execFileSync(process.execPath, [BINARY, "--version"], {
      encoding: "utf8",
    }).trim();

    expect(output).toBe(manifestVersion());
  }, 240_000);
});
