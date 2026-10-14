import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Migration 0016 (personal kit proposals) must be strictly additive: it
 * applies to a database at 0015 with rows and changes no existing object or
 * row, and its recorded rollback SQL restores the 0015 schema and wrangler's
 * bookkeeping.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle/migrations", import.meta.url));
const MIGRATION = "0016_personal_kit_proposals.sql";
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
const BEFORE = files.filter((f) => f < MIGRATION);
const read = (file: string) => readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
const OWNED = /^(idx_)?personal_kit_proposals/;

function apply(raw: DatabaseSync, list: string[]) {
  for (const file of list) for (const statement of read(file).split("--> statement-breakpoint")) if (statement.trim() !== "") raw.exec(statement);
}

const schema = (raw: DatabaseSync) => raw.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as Array<{ name: string }>;

function rollbackSql(): string[] {
  const lines = read(MIGRATION).split("\n");
  const start = lines.findIndex((line) => line.startsWith("-- Rollback"));
  expect(start).toBeGreaterThanOrEqual(0);
  return lines.slice(start + 1).flatMap((line) => {
    const match = /^--\s{3}(.+;)\s*$/.exec(line);
    return match ? [match[1]!] : [];
  });
}

function seeded(): DatabaseSync {
  const raw = new DatabaseSync(":memory:");
  raw.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)");
  apply(raw, BEFORE);
  for (const file of BEFORE) raw.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
  raw.exec(`
    INSERT INTO publishers (id, handle, display_name, owner_user_id, created_at) VALUES ('pub-1', 'p', 'P', 'u', 1);
    INSERT INTO packages (id, publisher_id, name, slug, kind, created_at, updated_at) VALUES ('pkg-1', 'pub-1', '@p/s', 's', 'skill', 1, 1);
    INSERT INTO personal_kits (id, name, publisher_id, owner_user_id, visibility, generation, latest_revision_number, created_at, updated_at)
      VALUES ('pk-1', '@p/k', 'pub-1', 'u', 'private', 1, 1, 1, 1);
  `);
  return raw;
}

const rows = (raw: DatabaseSync) => ["publishers", "packages", "personal_kits"].map((t) => raw.prepare(`SELECT * FROM ${t} ORDER BY id`).all());

describe("migration 0016_personal_kit_proposals", () => {
  it("follows 0015 and is recorded in the drizzle journal", () => {
    expect(BEFORE.at(-1)).toBe("0015_personal_kits.sql");
    const journal = JSON.parse(read("meta/_journal.json")) as { entries: Array<{ idx: number; tag: string }> };
    expect(journal.entries.find((e) => e.tag === "0016_personal_kit_proposals")).toMatchObject({ idx: 16 });
  });

  it("only creates proposal objects and changes no existing object or row", () => {
    for (const statement of read(MIGRATION).split("--> statement-breakpoint")) {
      const sql = statement.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").trim();
      if (sql === "") continue;
      expect(sql).toMatch(/^CREATE (TABLE|UNIQUE INDEX|INDEX|TRIGGER IF NOT EXISTS) `?(idx_)?personal_kit_proposals/);
      expect(sql.replace(/RAISE\(ABORT, '[^']*'\)/g, "")).not.toMatch(/\b(DROP|DELETE FROM|ALTER|INSERT)\b/i);
    }
    const raw = seeded();
    const before = schema(raw);
    const rowsBefore = rows(raw);
    apply(raw, [MIGRATION]);
    const added = schema(raw).filter((o) => !before.some((b) => b.name === o.name));
    expect(added.length).toBe(6);
    for (const o of added) expect(o.name).toMatch(OWNED);
    expect(schema(raw).filter((o) => !OWNED.test(o.name))).toEqual(before);
    expect(rows(raw)).toEqual(rowsBefore);
  });

  it("rolls back to the 0015 schema with the recorded SQL, and applies again", () => {
    const raw = seeded();
    const before = schema(raw);
    apply(raw, [MIGRATION]);
    raw.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(MIGRATION);
    const rollback = rollbackSql();
    expect(rollback.length).toBe(6);
    for (const statement of rollback) raw.exec(statement);
    expect(schema(raw)).toEqual(before);
    expect((raw.prepare("SELECT name FROM d1_migrations ORDER BY id").all() as Array<{ name: string }>).map((r) => r.name)).toEqual(BEFORE);
    apply(raw, [MIGRATION]);
  });
});
