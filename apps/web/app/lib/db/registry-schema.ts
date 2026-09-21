import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// Publishers — namespace owners that may publish packages.
export const publishers = sqliteTable(
  "publishers",
  {
    id: text("id").primaryKey(),
    handle: text("handle").notNull().unique(),
    display_name: text("display_name").notNull(),
    owner_user_id: text("owner_user_id"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_publishers_owner").on(table.owner_user_id)]
);

// Packages — stable identity and type. Metadata and history only; bytes live in releases.
export const packages = sqliteTable(
  "packages",
  {
    id: text("id").primaryKey(),
    publisher_id: text("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // fully-qualified '@handle/slug'
    slug: text("slug").notNull(),
    kind: text("kind").notNull(), // skill | hook-pack | bundle
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_packages_name").on(table.name),
    index("idx_packages_publisher").on(table.publisher_id),
  ]
);

// Package releases — immutable versions. A version may never receive different bytes.
export const packageReleases = sqliteTable(
  "package_releases",
  {
    id: text("id").primaryKey(),
    package_id: text("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    channel: text("channel").notNull().default("stable"),
    release_state: text("release_state").notNull().default("draft"),
    manifest_schema_version: text("manifest_schema_version").notNull(),
    artifact_key: text("artifact_key"), // R2 object key, populated by Phase 2
    artifact_digest: text("artifact_digest"), // sha256:<64 hex>
    artifact_size: integer("artifact_size"),
    source_provenance: text("source_provenance"), // JSON: repo, ref, commit
    compatibility_json: text("compatibility_json"), // declared `compatible` map as JSON
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    published_at: integer("published_at", { mode: "timestamp_ms" }),
    yanked_at: integer("yanked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("idx_package_releases_version").on(table.package_id, table.version),
    index("idx_package_releases_state").on(table.release_state),
  ]
);

// Release verification evidence — binds a verified badge to an exact release digest.
export const releaseVerificationEvidence = sqliteTable(
  "release_verification_evidence",
  {
    id: text("id").primaryKey(),
    release_id: text("release_id")
      .notNull()
      .references(() => packageReleases.id, { onDelete: "cascade" }),
    release_digest: text("release_digest").notNull(),
    harness: text("harness").notNull(),
    harness_version: text("harness_version").notNull(),
    os: text("os"),
    probe_id: text("probe_id").notNull(),
    verified_at: integer("verified_at", { mode: "timestamp_ms" }).notNull(),
    verifier: text("verifier").notNull(),
  },
  (table) => [
    index("idx_release_evidence_release").on(table.release_id),
    uniqueIndex("idx_release_evidence_probe").on(table.release_id, table.harness, table.probe_id),
  ]
);
