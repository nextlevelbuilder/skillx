import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `@skillx/contracts` is consumed as TypeScript source (no build step), so the
 * alias is declared explicitly instead of relying on the workspace symlink.
 */
const contractsEntry = fileURLToPath(new URL("./packages/contracts/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@skillx/contracts": contractsEntry,
    },
  },
  test: {
    include: [
      "apps/web/app/**/*.test.ts",
      "packages/cli/src/**/*.test.ts",
      "packages/contracts/src/**/*.test.ts",
    ],
  },
});
