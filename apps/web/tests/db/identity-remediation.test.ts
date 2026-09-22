import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildRemediation, normalizeD1Row } from "../../../../scripts/lib/identity-remediation.mjs";

/**
 * Statement-order regression tests for the identity remediation (issue #25).
 *
 * `skills.slug` is unique, so a one-pass update fails whenever a row must move to a slug another
 * row still holds. These fixtures reproduce that shape on a real database by executing the
 * generated statements one by one — a UNIQUE violation surfaces as a thrown error.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle/migrations", import.meta.url));

interface LegacyRow {
  id: string;
  slug: string;
  sourceUrl: string;
  content?: string;
}

function freshDatabase(): DatabaseSync {
  const raw = new DatabaseSync(":memory:");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) raw.exec(statement);
    }
  }

  return raw;
}

function insertLegacyRow(raw: DatabaseSync, row: LegacyRow) {
  raw
    .prepare(
      `INSERT INTO skills (id, name, slug, description, content, author, source_url, category, version, created_at, updated_at)
       VALUES (?, ?, ?, 'desc', ?, 'author', ?, 'general', '1.0.0', 1, 1)`,
    )
    .run(row.id, row.id, row.slug, row.content ?? "content", row.sourceUrl);
}

/** The same projection the D1 remediation reads (identity columns included, as in production). */
function legacyRows(raw: DatabaseSync) {
  return raw
    .prepare(
      "SELECT id, slug, source_url, source_repo, source_path, length(content) AS content_len FROM skills ORDER BY id",
    )
    .all();
}

function rowsOf(raw: DatabaseSync) {
  return raw.prepare("SELECT id, slug, source_repo, source_path FROM skills ORDER BY id").all() as Array<{
    id: string;
    slug: string;
    source_repo: string | null;
    source_path: string | null;
  }>;
}

function aliasesOf(raw: DatabaseSync) {
  return raw
    .prepare("SELECT slug, skill_id, reason FROM skill_aliases ORDER BY slug")
    .all() as Array<{ slug: string; skill_id: string; reason: string }>;
}

function applyAll(raw: DatabaseSync, statements: string[]) {
  for (const statement of statements) raw.exec(statement);
}

describe("identity remediation statement order", () => {
  it("renames rows whose target slug is still held by another row", () => {
    const raw = freshDatabase();
    // Two different paths in one repo, both folders named `thing`. row-x sorts first, so it owns
    // the readable base slug — which row-y currently holds.
    insertLegacyRow(raw, {
      id: "row-x",
      slug: "legacy-name",
      sourceUrl: "https://github.com/acme/tools/tree/main/a/thing",
    });
    insertLegacyRow(raw, {
      id: "row-y",
      slug: "acme-thing",
      sourceUrl: "https://github.com/acme/tools/tree/main/z/thing",
    });

    const { statements, changed, shadowed } = buildRemediation(legacyRows(raw));

    expect(changed).toHaveLength(2);
    expect(() => applyAll(raw, statements)).not.toThrow();

    const after = rowsOf(raw);
    const byId = new Map(after.map((row) => [row.id, row]));

    expect(byId.get("row-x")?.slug).toBe("acme-thing");
    expect(byId.get("row-y")?.slug).toMatch(/^acme-thing-[0-9a-f]{8}$/);
    expect(byId.get("row-x")?.source_path).toBe("a/thing");
    expect(byId.get("row-y")?.source_path).toBe("z/thing");
    expect(new Set(after.map((row) => row.slug)).size).toBe(after.length);

    const aliases = aliasesOf(raw);
    expect(aliases).toContainEqual({ slug: "legacy-name", skill_id: "row-x", reason: "legacy" });
    // row-y held `acme-thing`, which row-x owns now. Writing that alias would be shadowed by the
    // live slug, so it is reported instead; the old URL serves the skill that owns the name today.
    expect(aliases.map((alias) => alias.slug)).not.toContain("acme-thing");
    expect(shadowed.otherRow).toContainEqual({
      slug: "acme-thing",
      skillId: "row-y",
      reason: "legacy",
      ownerId: "row-x",
    });
  });

  it("moves a duplicate source row aside before renaming the survivor", () => {
    const raw = freshDatabase();
    // Same source identity twice. The richer row survives, and its canonical slug is the one the
    // duplicate currently holds.
    insertLegacyRow(raw, {
      id: "row-duplicate",
      slug: "acme-thing",
      content: "c",
      sourceUrl: "https://github.com/acme/tools/tree/main/skills/thing",
    });
    insertLegacyRow(raw, {
      id: "row-survivor",
      slug: "thing",
      content: "a much longer body, so this row wins the duplicate ranking",
      sourceUrl: "https://github.com/acme/tools/tree/main/skills/thing",
    });

    const { statements, dropped, shadowed } = buildRemediation(legacyRows(raw));

    expect(dropped).toHaveLength(1);
    expect(() => applyAll(raw, statements)).not.toThrow();

    const byId = new Map(rowsOf(raw).map((row) => [row.id, row]));
    expect(byId.get("row-survivor")?.slug).toBe("acme-thing");
    expect(byId.get("row-duplicate")?.slug).toBe("acme-thing-dup-row-dupl");
    expect(byId.get("row-duplicate")?.source_repo).toBeNull();

    const aliases = aliasesOf(raw);
    expect(aliases).toContainEqual({ slug: "thing", skill_id: "row-survivor", reason: "legacy" });
    // The survivor ends up owning `acme-thing`, so that alias would be shadowed by its own live
    // slug and is reported instead of written.
    expect(aliases.map((alias) => alias.slug)).not.toContain("acme-thing");
    expect(shadowed.sameRow).toContainEqual({
      slug: "acme-thing",
      skillId: "row-survivor",
      reason: "duplicate-source",
      ownerId: "row-survivor",
    });
  });

  it("refuses only when two rows would end up with the same slug", () => {
    const raw = freshDatabase();
    // Same repo, same leaf, so both rows want the base slug — the group rule gives one the base and
    // the other a fragment, so this must NOT be treated as a conflict.
    insertLegacyRow(raw, {
      id: "row-1",
      slug: "first",
      sourceUrl: "https://github.com/acme/tools/tree/main/a/thing",
    });
    insertLegacyRow(raw, {
      id: "row-2",
      slug: "second",
      sourceUrl: "https://github.com/acme/tools/tree/main/b/thing",
    });

    const { statements } = buildRemediation(legacyRows(raw));
    expect(() => applyAll(raw, statements)).not.toThrow();

    const slugs = rowsOf(raw).map((row) => row.slug);
    expect(slugs).toContain("acme-thing");
    expect(slugs.filter((slug) => slug.startsWith("acme-thing")).length).toBe(2);
    expect(new Set(slugs).size).toBe(2);
  });

  it("treats wrangler's stringified NULL as no value", () => {
    expect(
      normalizeD1Row({
        id: "row-a",
        source_repo: "null",
        source_path: "null",
        source_url: "null",
      }),
    ).toEqual({ id: "row-a", source_repo: null, source_path: null, source_url: null });

    // An empty path is a real value (the skill sits at the repository root) and must survive.
    expect(normalizeD1Row({ source_repo: "acme/tools", source_path: "" }).source_path).toBe("");
  });

  it("is idempotent: a second run over the same table rewrites nothing", () => {
    const raw = freshDatabase();
    insertLegacyRow(raw, {
      id: "row-x",
      slug: "legacy-name",
      sourceUrl: "https://github.com/acme/tools/tree/main/a/thing",
    });
    insertLegacyRow(raw, {
      id: "row-y",
      slug: "acme-thing",
      sourceUrl: "https://github.com/acme/tools/tree/main/z/thing",
    });
    insertLegacyRow(raw, {
      id: "row-keep",
      slug: "beta-thing",
      content: "a much longer body, so this row wins the duplicate ranking",
      sourceUrl: "https://github.com/beta/tools/tree/main/skills/thing",
    });
    insertLegacyRow(raw, {
      id: "row-loser",
      slug: "beta-other",
      content: "c",
      sourceUrl: "https://github.com/beta/tools/tree/main/skills/thing",
    });

    applyAll(raw, buildRemediation(legacyRows(raw)).statements);
    const afterFirstRun = rowsOf(raw);
    const aliasesAfterFirstRun = aliasesOf(raw).length;
    expect(afterFirstRun.map((row) => row.slug)).toContain("acme-thing");

    const second = buildRemediation(legacyRows(raw));

    expect(second.changed).toEqual([]);
    expect(second.statements).toEqual([]);
    expect(second.shadowed.sameRow).toEqual([]);
    expect(second.shadowed.otherRow).toEqual([]);
    expect(rowsOf(raw)).toEqual(afterFirstRun);
    expect(aliasesOf(raw)).toHaveLength(aliasesAfterFirstRun);
  });
});
