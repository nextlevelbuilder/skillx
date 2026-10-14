import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Migration 0013 (release state audit) must be strictly additive: it applies
 * to a database at 0012 with rows and changes no existing table, and its
 * recorded rollback SQL restores the 0012 schema and wrangler's bookkeeping.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle/migrations", import.meta.url));
const MIGRATION = "0013_release_state_audit.sql";
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
const BEFORE = files.filter((f) => f < MIGRATION);
const read = (file: string) => readFileSync(join(MIGRATIONS_DIR, file), "utf-8");

function apply(raw: DatabaseSync, list: string[]) {
  for (const file of list) for (const statement of read(file).split("--> statement-breakpoint")) if (statement.trim() !== "") raw.exec(statement);
}

/** Every schema object except the ones 0013 owns, with its SQL. */
function schema(raw: DatabaseSync) {
  return raw.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
}

function rollbackSql(): string[] {
  const lines = read(MIGRATION).split("\n");
  const start = lines.findIndex((line) => line.startsWith("-- Rollback"));
  expect(start).toBeGreaterThanOrEqual(0);
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^--\s{3}(.+;)\s*$/.exec(line);
    if (match) out.push(match[1]!);
    else if (!line.startsWith("--")) break;
  }
  return out;
}

function seeded(): DatabaseSync {
  const raw = new DatabaseSync(":memory:");
  raw.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)");
  apply(raw, BEFORE);
  for (const file of BEFORE) raw.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
  raw.exec(`
    INSERT INTO publishers (id, handle, display_name, owner_user_id, created_at) VALUES ('pub-1', 'p', 'P', 'u', 1);
    INSERT INTO packages (id, publisher_id, name, slug, kind, created_at, updated_at) VALUES ('pkg-1', 'pub-1', '@p/s', 's', 'skill', 1, 1);
    INSERT INTO package_releases (id, package_id, version, release_state, manifest_schema_version, created_at)
      VALUES ('rel-1', 'pkg-1', '1.0.0', 'published', 'skillx.release/v1', 1);
  `);
  return raw;
}

const registryRows = (raw: DatabaseSync) => ["publishers", "packages", "package_releases"].map((t) => raw.prepare(`SELECT * FROM ${t} ORDER BY id`).all());

describe("migration 0013_release_state_audit", () => {
  it("is the migration after 0012 and is recorded in the drizzle journal", () => {
    expect(BEFORE.at(-1)).toBe("0012_api_key_scopes.sql");
    const journal = JSON.parse(read("meta/_journal.json")) as { entries: Array<{ idx: number; tag: string }> };
    expect(journal.entries.find((e) => e.tag === "0013_release_state_audit")).toMatchObject({ idx: 13 });
  });

  it("only creates the audit table, its index and its append-only triggers", () => {
    const statements = read(MIGRATION)
      .split("--> statement-breakpoint")
      .map((s) => s.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").trim())
      .filter((s) => s !== "");
    expect(statements).toHaveLength(4);
    for (const statement of statements) {
      expect(statement).toMatch(/^CREATE (TABLE|INDEX|TRIGGER IF NOT EXISTS) `?(release_state_audit|idx_release_state_audit_subject|release_state_audit_no_(update|delete))`? /);
      expect(statement.replace(/RAISE\(ABORT, '[^']*'\)/, "")).not.toMatch(/\b(DROP|DELETE FROM|UPDATE \w+ SET|ALTER|INSERT)\b/i);
    }
  });

  it("applies to a database at 0012 without changing any existing object or row", () => {
    const raw = seeded();
    const schemaBefore = schema(raw);
    const rowsBefore = registryRows(raw);
    apply(raw, [MIGRATION]);
    const added = (schema(raw) as Array<{ name: string }>).filter((o) => !(schemaBefore as Array<{ name: string }>).some((b) => b.name === o.name)).map((o) => o.name).sort();
    expect(added).toEqual(["idx_release_state_audit_subject", "release_state_audit", "release_state_audit_no_delete", "release_state_audit_no_update"]);
    expect(schema(raw).filter((o) => !added.includes((o as { name: string }).name))).toEqual(schemaBefore);
    expect(registryRows(raw)).toEqual(rowsBefore);
  });

  it("rolls back to the 0012 schema with the recorded SQL, and applies again", () => {
    const raw = seeded();
    const schemaBefore = schema(raw);
    apply(raw, [MIGRATION]);
    raw.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(MIGRATION);
    raw.exec("INSERT INTO release_state_audit VALUES ('a', 'release', 'rel-1', 'admin', 'admin', 'published', 'yanked', 'applied', NULL, 1)");
    const rollback = rollbackSql();
    expect(rollback.length).toBe(5);
    for (const statement of rollback) raw.exec(statement);
    expect(schema(raw)).toEqual(schemaBefore);
    expect((raw.prepare("SELECT name FROM d1_migrations ORDER BY id").all() as Array<{ name: string }>).map((r) => r.name)).toEqual(BEFORE);
    apply(raw, [MIGRATION]);
    expect(raw.prepare("SELECT count(*) AS n FROM release_state_audit").get()).toEqual({ n: 0 });
  });
});
