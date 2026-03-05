import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { skills } from "./schema";

// Skill references — full markdown docs indexed in Vectorize for semantic search
export const skillReferences = sqliteTable(
  "skill_references",
  {
    id: text("id").primaryKey(),
    skill_id: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    filename: text("filename").notNull(),
    url: text("url"),
    type: text("type"), // docs, api, guide, cheatsheet
    content: text("content").notNull(),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_skill_refs_skill").on(table.skill_id),
    uniqueIndex("idx_skill_refs_unique").on(table.skill_id, table.filename),
  ]
);
