import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

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

// Better Auth tables — required by drizzle adapter
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text("scope"),
  idToken: text("idToken"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

// API keys - for CLI and external integrations
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull().default("Default"),
    key_hash: text("key_hash").notNull().unique(),
    key_prefix: text("key_prefix").notNull(), // first 8 chars for identification
    last_used_at: integer("last_used_at", { mode: "timestamp_ms" }),
    revoked_at: integer("revoked_at", { mode: "timestamp_ms" }),
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_api_keys_user").on(table.user_id),
    index("idx_api_keys_hash").on(table.key_hash),
  ]
);
