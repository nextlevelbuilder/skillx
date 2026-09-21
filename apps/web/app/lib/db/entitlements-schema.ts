import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { packages, packageReleases } from "./registry-schema";

// Entitlements — the authoritative record that a subject may access a paid
// package or release stream. Install records are NOT entitlements.
//
// Phase 0 ships the table skeleton only; grant/revoke policy, uniqueness
// enforcement, and purchase linkage arrive with commerce in Phase 5.
export const entitlements = sqliteTable(
  "entitlements",
  {
    id: text("id").primaryKey(),
    subject_id: text("subject_id").notNull(), // user or team id
    package_id: text("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    release_id: text("release_id").references(() => packageReleases.id, {
      onDelete: "cascade",
    }), // null = covers the package's whole release stream
    source: text("source").notNull(), // purchase | grant | import
    order_id: text("order_id"), // set when source = purchase
    granted_at: integer("granted_at", { mode: "timestamp_ms" }).notNull(),
    revoked_at: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("idx_entitlements_subject").on(table.subject_id),
    index("idx_entitlements_package").on(table.package_id),
  ]
);
