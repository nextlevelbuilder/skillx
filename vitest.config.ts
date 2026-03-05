import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/web/app/**/*.test.ts",
      "packages/cli/src/**/*.test.ts",
    ],
  },
});
