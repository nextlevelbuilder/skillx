import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// Auth and API-key tables live in their own module so this file stays within
// the project's 200 LOC rule. Re-exported so `~/lib/db/schema` remains the
// single import site for every caller.
export * from "./auth-schema";


// Skills - core marketplace entity
export const skills = sqliteTable(
  "skills",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull(),
    content: text("content").notNull(),
    author: text("author").notNull(),
    source_url: text("source_url"),
    category: text("category").notNull(),
    install_command: text("install_command"),
    version: text("version").default("1.0.0"),
    is_paid: integer("is_paid", { mode: "boolean" }).default(false),
    price_cents: integer("price_cents").default(0),
    avg_rating: real("avg_rating").default(0),
    rating_count: integer("rating_count").default(0),
    github_stars: integer("github_stars").default(0),
    install_count: integer("install_count").default(0),
    // Precomputed leaderboard scores (updated on write events)
    composite_score: real("composite_score").default(0),
    bayesian_rating: real("bayesian_rating").default(0),
    trending_score: real("trending_score").default(0),
    favorite_count: integer("favorite_count").default(0),
    upvote_count: integer("upvote_count").default(0),
    downvote_count: integer("downvote_count").default(0),
    net_votes: integer("net_votes").default(0),
    scripts: text("scripts"), // JSON: [{name, command, url}]
    // JSON: publisher-declared runtime compatibility map (`skillx.package/v1`
    // `compatible` shape). A listing has no artifact digest, so a declaration
    // here can reach `declared` but never `verified`.
    compatibility_json: text("compatibility_json"),
    fts_content: text("fts_content"), // Computed: content + ref titles (for FTS5)
    risk_label: text("risk_label").default("unknown"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_skills_category").on(table.category),
    index("idx_skills_author").on(table.author),
    index("idx_skills_avg_rating").on(table.avg_rating),
    index("idx_skills_composite_score").on(table.composite_score),
    index("idx_skills_trending_score").on(table.trending_score),
    index("idx_skills_net_votes").on(table.net_votes),
  ]
);

// Votes - Reddit-style upvote/downvote
export const votes = sqliteTable(
  "votes",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    skill_id: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    vote_type: text("vote_type").notNull(), // 'up' | 'down'
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_votes_user_skill").on(table.user_id, table.skill_id),
    index("idx_votes_skill").on(table.skill_id),
  ]
);

// Ratings - 0-10 scale, human or agent
export const ratings = sqliteTable(
  "ratings",
  {
    id: text("id").primaryKey(),
    skill_id: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    user_id: text("user_id").notNull(),
    score: real("score").notNull(),
    is_agent: integer("is_agent", { mode: "boolean" }).default(false),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_ratings_user_skill").on(table.user_id, table.skill_id),
    index("idx_ratings_skill").on(table.skill_id),
  ]
);

// Reviews - text feedback
export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    skill_id: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    user_id: text("user_id").notNull(),
    content: text("content").notNull(),
    is_agent: integer("is_agent", { mode: "boolean" }).default(false),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_reviews_skill").on(table.skill_id),
    index("idx_reviews_user").on(table.user_id),
  ]
);

// Favorites - user bookmarks
export const favorites = sqliteTable(
  "favorites",
  {
    user_id: text("user_id").notNull(),
    skill_id: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_favorites_pk").on(table.user_id, table.skill_id),
    index("idx_favorites_skill").on(table.skill_id),
  ]
);

// Usage stats - track skill execution outcomes
export const usageStats = sqliteTable(
  "usage_stats",
  {
    id: text("id").primaryKey(),
    skill_id: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    user_id: text("user_id"),
    model: text("model"),
    outcome: text("outcome").notNull(), // 'success' | 'failure' | 'partial'
    duration_ms: integer("duration_ms"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_usage_skill").on(table.skill_id),
    index("idx_usage_created").on(table.created_at),
  ]
);

// Installs - deduplicated install tracking per user/device
export const installs = sqliteTable(
  "installs",
  {
    id: text("id").primaryKey(),
    skill_id: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    user_id: text("user_id"),
    device_id: text("device_id"),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_installs_skill").on(table.skill_id),
    uniqueIndex("idx_installs_user")
      .on(table.skill_id, table.user_id)
      .where(sql`user_id IS NOT NULL`),
    uniqueIndex("idx_installs_device")
      .on(table.skill_id, table.device_id)
      .where(sql`device_id IS NOT NULL`),
  ]
);
