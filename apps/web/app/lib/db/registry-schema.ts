import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// Publishers — namespace owners that may publish packages.
export const publishers = sqliteTable(
  "publishers",
  {
    id: text("id").primaryKey(),
    handle: text("handle").notNull().unique(),
    display_name: text("display_name").notNull(),
    owner_user_id: text("owner_user_id"),
    state: text("state").notNull().default("active"), // active | suspended | revoked
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
    visibility: text("visibility").notNull().default("public"), // public | private
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
    release_digest: text("release_digest"), // treeDigest of the file tree: sha256:<64 hex>
    file_count: integer("file_count"),
    tree_size: integer("tree_size"),
    signed_manifest_key: text("signed_manifest_key"), // R2 key of the signed skillx.release/v1 manifest
    source_provenance: text("source_provenance"), // JSON: repo, ref, commit
    compatibility_json: text("compatibility_json"), // declared `compatible` map as JSON
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    published_at: integer("published_at", { mode: "timestamp_ms" }),
    yanked_at: integer("yanked_at", { mode: "timestamp_ms" }),
    quarantined_at: integer("quarantined_at", { mode: "timestamp_ms" }),
    // Last signed skillx.release-status/v1 document: strictly increasing sequence and its issuedAt.
    status_sequence: integer("status_sequence"),
    status_issued_at: integer("status_issued_at", { mode: "timestamp_ms" }),
    status_key: text("status_key"), // R2 key of that signed status document
    exec_summary_json: text("exec_summary_json"), // JSON: parsed agentkit-exec.json capability summary
  },
  (table) => [
    uniqueIndex("idx_package_releases_version").on(table.package_id, table.version),
    index("idx_package_releases_state").on(table.release_state),
    // Not unique: one tree may be released under several versions or packages.
    index("idx_package_releases_digest").on(table.release_digest),
  ]
);

// Release and publisher state transitions: one row per attempt (applied, stale, denied or invalid).
// Append-only: migration 0013 adds triggers that abort any UPDATE or DELETE. No foreign keys, so
// the history outlives its subject.
export const releaseStateAudit = sqliteTable(
  "release_state_audit",
  {
    id: text("id").primaryKey(),
    subject_kind: text("subject_kind").notNull(), // release | publisher | release_channel | trusted_publisher | collection
    subject_id: text("subject_id").notNull(), // package_releases.id, publishers.id, trusted_publishers.id or collections.id
    actor_kind: text("actor_kind").notNull(), // admin | user | publisher_key (scoped key or OIDC publish token)
    actor_id: text("actor_id").notNull(), // 'admin' (shared ADMIN_SECRET), the user id, the API key id, or oidc:<jti>
    from_state: text("from_state").notNull(), // the state the actor expected (compare-and-set); "none" for a publisher creation
    to_state: text("to_state").notNull(),
    outcome: text("outcome").notNull(), // applied | stale | denied | invalid
    reason: text("reason"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_release_state_audit_subject").on(table.subject_kind, table.subject_id, table.created_at)]
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
