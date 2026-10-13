import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Migration 0012 (scoped API keys) is one additive nullable column; existing keys stay
 * unscoped, and the recorded rollback revokes scoped keys before dropping the column.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle/migrations", import.meta.url));
const MIGRATION = "0012_api_key_scopes.sql";
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
const BEFORE = files.filter((f) => f < MIGRATION);

function apply(raw: DatabaseSync, names: string[]) {
  for (const name of names) {
    for (const statement of readFileSync(join(MIGRATIONS_DIR, name), "utf-8").split("--> statement-breakpoint")) {
      if (statement.trim() !== "") raw.exec(statement);
    }
  }
}

function rollbackSql(): string[] {
  const lines = readFileSync(join(MIGRATIONS_DIR, MIGRATION), "utf-8").split("\n");
  const start = lines.findIndex((line) => line.startsWith("-- Rollback"));
  return lines
    .slice(start + 1)
    .map((line) => /^--\s{3}(.+;)\s*$/.exec(line)?.[1])
    .filter((s): s is string => s !== undefined);
}

const columns = (raw: DatabaseSync) =>
  (raw.prepare("PRAGMA table_info(api_keys)").all() as Array<{ name: string; notnull: number; dflt_value: unknown }>);

function seed(raw: DatabaseSync) {
  raw.exec(`INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, created_at) VALUES
    ('k1', 'u1', 'Default', 'h1', 'sx_aaaaa', 1000), ('k2', 'u2', 'CI', 'h2', 'sx_bbbbb', 2000)`);
}

describe("migration 0012_api_key_scopes", () => {
  it("follows 0011 and only adds a nullable column", () => {
    expect(BEFORE.at(-1)).toMatch(/^0011_/);
    const raw = new DatabaseSync(":memory:");
    apply(raw, BEFORE);
    seed(raw);
    const before = raw.prepare("SELECT * FROM api_keys ORDER BY id").all();
    apply(raw, [MIGRATION]);
    expect(columns(raw).find((c) => c.name === "scopes")).toMatchObject({ notnull: 0, dflt_value: null });
    const after = raw.prepare("SELECT * FROM api_keys ORDER BY id").all() as Array<Record<string, unknown>>;
    expect(after.map(({ scopes: _scopes, ...rest }) => rest)).toEqual(before);
    expect(after.every((row) => row.scopes === null)).toBe(true);
  });

  it("rolls back with the recorded SQL, revoking scoped keys first", () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)");
    apply(raw, BEFORE);
    seed(raw);
    const shape = columns(raw);
    apply(raw, [MIGRATION]);
    raw.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(MIGRATION);
    raw.exec(`UPDATE api_keys SET scopes = '["releases:publish:@alpha"]' WHERE id = 'k2'`);

    const rollback = rollbackSql();
    expect(rollback).toHaveLength(3);
    for (const statement of rollback) raw.exec(statement);

    expect(columns(raw)).toEqual(shape);
    const rows = raw.prepare("SELECT id, revoked_at FROM api_keys ORDER BY id").all() as Array<{ id: string; revoked_at: number | null }>;
    expect(rows[0]!.revoked_at).toBeNull();
    expect(rows[1]!.revoked_at).toBeGreaterThan(0);
    expect(raw.prepare("SELECT count(*) AS n FROM d1_migrations").get()).toEqual({ n: 0 });
  });
});
