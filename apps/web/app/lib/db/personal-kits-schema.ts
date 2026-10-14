import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { publishers } from "./registry-schema";

// Personal kits: a user's private composition of pinned skill releases plus overlays.
// `name` is the published identity '@handle/name'; `generation` is the compare-and-set
// counter every mutation must present. `effective_revision_id` is the active revision.
export const personalKits = sqliteTable(
  "personal_kits",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    publisher_id: text("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),
    owner_user_id: text("owner_user_id").notNull(),
    local_id: text("local_id"), // 'local/<name>' of the AgentKit-side kit, when known
    visibility: text("visibility").notNull().default("private"), // private | public
    generation: integer("generation").notNull().default(0),
    effective_revision_id: text("effective_revision_id"),
    latest_revision_number: integer("latest_revision_number").notNull().default(0),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("idx_personal_kits_name").on(table.name), index("idx_personal_kits_owner").on(table.owner_user_id)]
);

// Immutable revisions. Migration 0015 adds a trigger that aborts any UPDATE of the content
// columns; only the review timestamps and `state` may change.
export const personalKitRevisions = sqliteTable(
  "personal_kit_revisions",
  {
    id: text("id").primaryKey(),
    kit_id: text("kit_id")
      .notNull()
      .references(() => personalKits.id, { onDelete: "cascade" }),
    revision_number: integer("revision_number").notNull(),
    parent_revision_id: text("parent_revision_id"), // the revision this one was derived from
    revision_digest: text("revision_digest").notNull(), // sha256 of the canonical skillx.personal-kit/v1 JSON
    document_json: text("document_json").notNull(),
    state: text("state").notNull().default("draft"), // draft | proposed | reviewed | rejected | quarantined
    origin: text("origin").notNull(), // manual | rebase | resolution | session-derived
    author_user_id: text("author_user_id").notNull(),
    idempotency_key: text("idempotency_key").notNull(),
    approval_json: text("approval_json"), // approval record of activation or review
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    reviewed_at: integer("reviewed_at", { mode: "timestamp_ms" }),
    activated_at: integer("activated_at", { mode: "timestamp_ms" }),
    rejected_at: integer("rejected_at", { mode: "timestamp_ms" }),
    quarantined_at: integer("quarantined_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("idx_personal_kit_revisions_number").on(table.kit_id, table.revision_number),
    uniqueIndex("idx_personal_kit_revisions_idempotency").on(table.kit_id, table.idempotency_key),
    uniqueIndex("idx_personal_kit_revisions_digest").on(table.kit_id, table.revision_digest),
  ]
);

// Rebase conflicts awaiting a user decision. The report holds categories and paths only.
export const personalKitConflicts = sqliteTable(
  "personal_kit_conflicts",
  {
    id: text("id").primaryKey(),
    kit_id: text("kit_id")
      .notNull()
      .references(() => personalKits.id, { onDelete: "cascade" }),
    from_revision_id: text("from_revision_id").notNull(),
    report_json: text("report_json").notNull(),
    status: text("status").notNull().default("open"), // open | resolved | superseded
    resolution_json: text("resolution_json"),
    resolved_by: text("resolved_by"),
    resolved_revision_id: text("resolved_revision_id"),
    reeval_required: integer("reeval_required").notNull().default(0),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    resolved_at: integer("resolved_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("idx_personal_kit_conflicts_kit").on(table.kit_id, table.status)]
);

// Append-only audit of every personal-kit mutation (migration 0015 triggers abort UPDATE and DELETE).
export const personalKitAudit = sqliteTable(
  "personal_kit_audit",
  {
    id: text("id").primaryKey(),
    kit_id: text("kit_id").notNull(),
    actor_kind: text("actor_kind").notNull(), // user | admin
    actor_id: text("actor_id").notNull(),
    action: text("action").notNull(),
    revision_id: text("revision_id"),
    detail: text("detail"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_personal_kit_audit_kit").on(table.kit_id, table.created_at)]
);
