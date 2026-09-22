import { beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { skills } from "../../app/lib/db/schema";
import { recordSkillAlias, resolveSkillBySlug } from "../../app/lib/db/skill-aliases";
import type { Database } from "../../app/lib/db/index";

/**
 * Integration test for the alias layer (issue #25).
 *
 * These tests need Node APIs, so they live outside `app/**`: the Worker app is typechecked
 * with `types: ["vite/client"]` only and must not pull Node globals into its program.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle/migrations", import.meta.url));

/** Apply the real Drizzle migration chain to a throwaway SQLite database. */
function applyMigrations(raw: DatabaseSync) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) raw.exec(statement);
    }
  }
}

/** Bind the production query helpers to the throwaway database. */
function createDb(raw: DatabaseSync): Database {
  return drizzle(async (sql, params, method) => {
    const prepared = raw.prepare(sql);
    if (method === "run") {
      prepared.run(...(params as never[]));
      return { rows: [] };
    }
    const rows = prepared
      .all(...(params as never[]))
      .map((row: Record<string, unknown>) => Object.values(row));
    return { rows };
  }) as unknown as Database;
}

function skillValues(id: string, slug: string, sourceRepo: string, sourcePath: string) {
  return {
    id,
    name: `name-${id}`,
    slug,
    description: "desc",
    content: "content",
    author: "author",
    category: "testing",
    version: "1.0.0",
    is_paid: false,
    price_cents: 0,
    avg_rating: 0,
    rating_count: 0,
    github_stars: 0,
    install_count: 0,
    risk_label: "safe",
    source_repo: sourceRepo,
    source_path: sourcePath,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

describe("skill alias resolution", () => {
  let db: Database;

  beforeAll(async () => {
    const raw = new DatabaseSync(":memory:");
    applyMigrations(raw);
    db = createDb(raw);

    await db
      .insert(skills)
      .values(
        skillValues(
          "s1",
          "ypyt1-ui-ux-pro-max",
          "ypyt1/all-skills",
          "skills/_local/clawd-skills/ui-ux-pro-max",
        ),
      );
    await db
      .insert(skills)
      .values(skillValues("s2", "ypyt1-ui-ux-pro-max-719a8cd0", "ypyt1/all-skills", "skills/ui-ux-pro-max"));

    await recordSkillAlias(db, {
      slug: "ypyt1-ui-ux-pro-max-ill-md",
      skillId: "s2",
      reason: "legacy",
    });
    await recordSkillAlias(db, { slug: "ypyt1-ui-ux-pro-max", skillId: "s2", reason: "legacy" });
  });

  it("applies the migration chain and reads back a canonical slug", async () => {
    const found = await resolveSkillBySlug(db, "ypyt1-ui-ux-pro-max-719a8cd0");
    expect(found?.id).toBe("s2");
  });

  it("resolves the mangled legacy slug through skill_aliases", async () => {
    const found = await resolveSkillBySlug(db, "ypyt1-ui-ux-pro-max-ill-md");
    expect(found?.id).toBe("s2");
    expect(found?.source_path).toBe("skills/ui-ux-pro-max");
  });

  it("prefers a canonical slug over an alias of the same name", async () => {
    const found = await resolveSkillBySlug(db, "ypyt1-ui-ux-pro-max");
    expect(found?.id).toBe("s1");
  });

  it("returns null for an unknown slug", async () => {
    expect(await resolveSkillBySlug(db, "does-not-exist")).toBeNull();
  });

  it("keeps two same-leaf-name skills from one repo as distinct identities", async () => {
    const rows = await db.select().from(skills);
    const sameRepo = rows.filter((row) => row.source_repo === "ypyt1/all-skills");
    expect(sameRepo).toHaveLength(2);
    expect(new Set(sameRepo.map((row) => row.source_path)).size).toBe(2);
    expect(new Set(sameRepo.map((row) => row.slug)).size).toBe(2);
  });

  it("rejects a second row with the same source identity", async () => {
    await expect(
      db
        .insert(skills)
        .values(skillValues("s3", "another-slug", "ypyt1/all-skills", "skills/ui-ux-pro-max")),
    ).rejects.toThrow();
  });

  it("is idempotent when an alias is recorded twice", async () => {
    await recordSkillAlias(db, { slug: "ypyt1-ui-ux-pro-max-ill-md", skillId: "s1" });
    const found = await resolveSkillBySlug(db, "ypyt1-ui-ux-pro-max-ill-md");
    expect(found?.id).toBe("s2");
  });
});
