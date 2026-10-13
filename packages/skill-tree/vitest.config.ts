import { defineConfig } from "vitest/config";

/** Lets `pnpm --filter @skillx/skill-tree test` run the package suite on its own; the root config also includes it. */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
