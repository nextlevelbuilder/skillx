import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./schema";

// AgentKit account links: one agentkit.best account (`iss`, `sub`) per SkillX
// account and the reverse. The refresh token of SkillX's own grant is stored
// AES-GCM encrypted; the link is re-validated by refreshing it (see
// lib/agentkit/link-liveness.ts) and the row is deleted on unlink or revoke.
export const agentkitLinks = sqliteTable(
  "agentkit_links",
  {
    user_id: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    agentkit_sub: text("agentkit_sub").notNull(),
    scopes: text("scopes").notNull(), // space-separated, as granted
    refresh_token_enc: text("refresh_token_enc"),
    linked_at: integer("linked_at", { mode: "timestamp_ms" }).notNull(),
    // Last successful refresh (or the link itself): the link is trusted for 60 s after it.
    validated_at: integer("validated_at", { mode: "timestamp_ms" }).notNull(),
    // A refresh in flight until this time; refresh tokens are one-time, so only one request refreshes.
    refreshing_until: integer("refreshing_until", { mode: "timestamp_ms" }),
  },
  (table) => [uniqueIndex("idx_agentkit_links_subject").on(table.issuer, table.agentkit_sub)]
);
