import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle/migrations",
  // Listed explicitly (not a glob) so the hand-written `skill_references`
  // migration is not re-emitted; see docs/legacy-listing-migration-plan.md.
  schema: [
    "./app/lib/db/schema.ts",
    "./app/lib/db/registry-schema.ts",
    "./app/lib/db/entitlements-schema.ts",
    "./app/lib/db/collections-schema.ts",
  ],
  dialect: "sqlite",
});
