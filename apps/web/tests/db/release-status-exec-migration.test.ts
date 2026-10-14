import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Migration 0014 adds two nullable package_releases columns (signed status pointer, exec
 * summary); existing rows keep every value, and the recorded rollback restores the shape.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle/migrations", import.meta.url));
const MIGRATION = "0014_release_status_and_exec.sql";
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
  raw.prepare("PRAGMA table_info(package_releases)").all() as Array<{ name: string; notnull: number; dflt_value: unknown }>;

function seed(raw: DatabaseSync) {
  raw.exec(`INSERT INTO publishers (id, handle, display_name, created_at) VALUES ('pub1', 'alpha', 'Alpha', 1)`);
  raw.exec(`INSERT INTO packages (id, publisher_id, name, slug, kind, created_at, updated_at) VALUES ('pkg1', 'pub1', '@alpha/one', 'one', 'skill', 1, 1)`);
  raw.exec(`INSERT INTO package_releases (id, package_id, version, channel, release_state, manifest_schema_version,
      artifact_key, artifact_digest, artifact_size, created_at, status_sequence)
    VALUES ('rel1', 'pkg1', '1.0.0', 'stable', 'published', 'skillx.release/v1', 'artifacts/a', 'sha256:aa', 10, 1000, 3)`);
}

describe("migration 0014_release_status_and_exec", () => {
  it("follows 0013 and only adds nullable columns", () => {
    expect(BEFORE.at(-1)).toMatch(/^0013_/);
    const raw = new DatabaseSync(":memory:");
    apply(raw, BEFORE);
    seed(raw);
    const before = raw.prepare("SELECT * FROM package_releases").all();
    apply(raw, [MIGRATION]);
    for (const name of ["status_key", "exec_summary_json"]) {
      expect(columns(raw).find((c) => c.name === name)).toMatchObject({ notnull: 0, dflt_value: null });
    }
    const after = raw.prepare("SELECT * FROM package_releases").all() as Array<Record<string, unknown>>;
    expect(after.map(({ status_key: _s, exec_summary_json: _e, ...rest }) => rest)).toEqual(before);
    expect(after.every((row) => row.status_key === null && row.exec_summary_json === null)).toBe(true);
  });

  it("rolls back with the recorded SQL", () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)");
    apply(raw, BEFORE);
    seed(raw);
    const shape = columns(raw);
    apply(raw, [MIGRATION]);
    raw.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(MIGRATION);
    const rollback = rollbackSql();
    expect(rollback).toHaveLength(3);
    for (const statement of rollback) raw.exec(statement);
    expect(columns(raw)).toEqual(shape);
    expect(raw.prepare("SELECT count(*) AS n FROM d1_migrations").get()).toEqual({ n: 0 });
  });
});
