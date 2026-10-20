import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// Collections — a user-authored recipe. A collection references packages; it
// never redistributes their bytes.
export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    owner_id: text("owner_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    visibility: text("visibility").notNull().default("private"), // private | unlisted | public
    latest_revision_number: integer("latest_revision_number").notNull().default(0),
    // Lineage of a clone: the source revision it was copied from (no FK: the source may be deleted).
    cloned_from_revision_id: text("cloned_from_revision_id"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("idx_collections_owner_slug").on(table.owner_id, table.slug)]
);

// Collection revisions — immutable snapshots used for reproducible installs.
// `config_json` holds non-secret configuration only.
export const collectionRevisions = sqliteTable(
  "collection_revisions",
  {
    id: text("id").primaryKey(),
    collection_id: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    revision_number: integer("revision_number").notNull(),
    members_json: text("members_json").notNull(), // JSON: [{ packageName, version?, digest?, optional? }]
    config_json: text("config_json"), // JSON: non-secret configuration
    revision_digest: text("revision_digest"), // sha256 of canonical {config, members}
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_collection_revisions_number").on(table.collection_id, table.revision_number),
    index("idx_collection_revisions_collection").on(table.collection_id),
  ]
);
