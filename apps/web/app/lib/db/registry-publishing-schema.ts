import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

// Release publish idempotency: one row per (publisher, Idempotency-Key). The fingerprint binds the
// key to one exact request (name, version, metadata, body sha256); the stored answer is replayed.
export const releasePublishIdempotency = sqliteTable(
  "release_publish_idempotency",
  {
    publisher_id: text("publisher_id").notNull(),
    idempotency_key: text("idempotency_key").notNull(),
    request_fingerprint: text("request_fingerprint").notNull(), // sha256:<64 hex>
    status: text("status").notNull(), // pending | complete
    response_status: integer("response_status"),
    response_body: text("response_body"), // JSON body replayed verbatim
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expires_at: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.publisher_id, table.idempotency_key] }),
    index("idx_release_publish_idempotency_expires").on(table.expires_at), // expired-row cleanup
  ]
);

// Operator review decisions on quarantined releases. Append-only (triggers in the migration);
// the state change of an approval is audited in release_state_audit in the same batch.
export const releaseReviews = sqliteTable(
  "release_reviews",
  {
    id: text("id").primaryKey(),
    release_id: text("release_id").notNull(),
    release_digest: text("release_digest"),
    decision: text("decision").notNull(), // approved | rejected
    actor_kind: text("actor_kind").notNull(), // admin
    actor_id: text("actor_id").notNull(),
    reason: text("reason"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_release_reviews_release").on(table.release_id, table.created_at)]
);

// GitHub Actions OIDC trusted publishers: which repository + workflow (+ ref, environment) may
// exchange an OIDC token for a short-lived releases:publish:@handle token.
export const trustedPublishers = sqliteTable(
  "trusted_publishers",
  {
    id: text("id").primaryKey(),
    publisher_id: text("publisher_id").notNull(),
    provider: text("provider").notNull(), // github
    repository: text("repository").notNull(), // owner/repo, lowercase
    repository_id: text("repository_id").notNull(), // numeric GitHub id; survives renames, blocks re-registration
    workflow_path: text("workflow_path").notNull(), // .github/workflows/<file>.yml
    ref: text("ref"), // e.g. refs/heads/main; null = any ref
    environment: text("environment"), // GitHub environment name; null = any
    state: text("state").notNull().default("active"), // active | revoked
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    revoked_at: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("idx_trusted_publishers_publisher").on(table.publisher_id)]
);

// One row per accepted OIDC exchange. The primary key on the token's jti refuses replays.
export const oidcTokenExchanges = sqliteTable(
  "oidc_token_exchanges",
  {
    jti: text("jti").primaryKey(),
    trusted_publisher_id: text("trusted_publisher_id").notNull(),
    publisher_id: text("publisher_id").notNull(),
    repository: text("repository").notNull(),
    workflow_ref: text("workflow_ref").notNull(),
    run_id: text("run_id"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    token_expires_at: integer("token_expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_oidc_token_exchanges_trusted").on(table.trusted_publisher_id, table.created_at),
    index("idx_oidc_token_exchanges_created").on(table.created_at), // retention cleanup
  ]
);
