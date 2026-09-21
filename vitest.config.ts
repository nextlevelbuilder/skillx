import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * `@skillx/contracts` is consumed as TypeScript source (no build step), and the
 * web app resolves its own modules through the `~` alias, so both are declared
 * here instead of relying on workspace symlinks or the app's tsconfig.
 */
const contractsEntry = fileURLToPath(new URL("./packages/contracts/src/index.ts", import.meta.url));
const webAppRoot = fileURLToPath(new URL("./apps/web/app", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@skillx/contracts": contractsEntry,
      "~": webAppRoot,
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
