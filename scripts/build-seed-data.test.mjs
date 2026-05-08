import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("build-seed-data", () => {
  it("fails when the seed file cannot be read", async () => {
    const testDirectory = await mkdtemp(join(tmpdir(), "skillx-seed-test-"));
    const scriptPath = join(testDirectory, "build-seed-data.mjs");

    try {
      await copyFile(new URL("./build-seed-data.mjs", import.meta.url), scriptPath);

      const result = spawnSync(process.execPath, [scriptPath]);

      expect(result.status).toBe(1);
    } finally {
      await rm(testDirectory, { force: true, recursive: true });
    }
  });
});
