import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Migration 0011 (release tree digest, publisher state, package visibility) must be strictly
 * additive: it applies to a fresh database and to a database at 0010 with rows, leaves every
 * existing value unchanged, and its recorded rollback SQL restores the 0010 shape.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle/migrations", import.meta.url));
const MIGRATION_0011 = "0011_release_tree_digest.sql";

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort();

function statementsOf(file: string): string[] {
  return readFileSync(join(MIGRATIONS_DIR, file), "utf-8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");
}

function applyMigrations(raw: DatabaseSync, files: string[]) {
  for (const file of files) for (const statement of statementsOf(file)) raw.exec(statement);
}

/** Statements with their comment lines removed. */
function executableSql(file: string): string[] {
  return statementsOf(file)
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement !== "");
}

/** The rollback statements recorded in the migration header comment. */
function rollbackSql(file: string): string[] {
  const lines = readFileSync(join(MIGRATIONS_DIR, file), "utf-8").split("\n");
  const start = lines.findIndex((line) => line.startsWith("-- Rollback"));
  expect(start, "migration records rollback SQL").toBeGreaterThanOrEqual(0);
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^--\s{3}(.+;)\s*$/.exec(line);
    if (match) out.push(match[1]!);
    else if (!line.startsWith("--")) break;
  }
  return out;
}

type Row = Record<string, unknown>;

function columns(raw: DatabaseSync, table: string): Row[] {
  return raw.prepare(`PRAGMA table_info(${table})`).all() as Row[];
}

function indexes(raw: DatabaseSync, table: string): string[] {
  return (raw.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>).map((i) => i.name).sort();
}

const REGISTRY_TABLES = ["publishers", "packages", "package_releases"] as const;

function snapshot(raw: DatabaseSync, columnsByTable: Record<string, string[]>) {
  return Object.fromEntries(
    REGISTRY_TABLES.map((table) => {
      const cols = columnsByTable[table]!.map((c) => `\`${c}\``).join(", ");
      return [table, raw.prepare(`SELECT ${cols} FROM ${table} ORDER BY id`).all()];
    }),
  );
}

function seedRegistry(raw: DatabaseSync) {
  raw.exec(`
    INSERT INTO publishers (id, handle, display_name, owner_user_id, created_at) VALUES
      ('pub-1', 'publisher', 'Publisher', 'user-1', 1000),
      ('pub-2', 'solo.dev', 'Solo', NULL, 2000);
    INSERT INTO packages (id, publisher_id, name, slug, kind, created_at, updated_at) VALUES
      ('pkg-1', 'pub-1', '@publisher/review-guardrails', 'review-guardrails', 'skill', 1000, 1100),
      ('pkg-2', 'pub-2', '@solo.dev/tiny', 'tiny', 'hook-pack', 2000, 2100);
    INSERT INTO package_releases (id, package_id, version, channel, release_state, manifest_schema_version,
        artifact_key, artifact_digest, artifact_size, source_provenance, compatibility_json, created_at, published_at, yanked_at) VALUES
      ('rel-1', 'pkg-1', '1.0.0', 'stable', 'published', 'skillx.package/v1',
        'artifacts/sha256/${"a".repeat(64)}.tar', 'sha256:${"a".repeat(64)}', 4096, '{"repo":"x"}', '{}', 1200, 1300, NULL),
      ('rel-2', 'pkg-1', '1.1.0', 'beta', 'yanked', 'skillx.package/v1', NULL, NULL, NULL, NULL, NULL, 1400, NULL, 1500),
      ('rel-3', 'pkg-2', '0.1.0', 'stable', 'draft', 'skillx.package/v1', NULL, NULL, NULL, NULL, NULL, 2200, NULL, NULL);
  `);
}

describe("migration 0011_release_tree_digest", () => {
  it("is the latest migration", () => {
    expect(migrationFiles.at(-1)).toBe(MIGRATION_0011);
  });

  it("contains only additive statements", () => {
    const statements = executableSql(MIGRATION_0011);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement, statement).toMatch(/^(ALTER TABLE `\w+` ADD `\w+` [^;]+;|CREATE INDEX `\w+` ON `\w+` \([^)]*\);)$/);
      expect(statement).not.toMatch(/\b(DROP|DELETE|UPDATE|RENAME|INSERT)\b/i);
      // A NOT NULL column added to a table with rows needs a default.
      if (/NOT NULL/.test(statement)) expect(statement).toMatch(/DEFAULT '[a-z]+' NOT NULL/);
    }
  });

  it("applies to a fresh database with the documented defaults", () => {
    const raw = new DatabaseSync(":memory:");
    applyMigrations(raw, migrationFiles);
    const byName = (table: string) => Object.fromEntries(columns(raw, table).map((c) => [c.name, c]));
    expect(byName("publishers").state).toMatchObject({ notnull: 1, dflt_value: "'active'" });
    expect(byName("packages").visibility).toMatchObject({ notnull: 1, dflt_value: "'public'" });
    for (const column of [
      "release_digest",
      "file_count",
      "tree_size",
      "signed_manifest_key",
      "quarantined_at",
      "status_sequence",
      "status_issued_at",
    ]) {
      expect(byName("package_releases")[column], column).toMatchObject({ notnull: 0, dflt_value: null });
    }
    expect(indexes(raw, "package_releases")).toContain("idx_package_releases_digest");
    expect(indexes(raw, "package_releases")).toContain("idx_package_releases_version");
  });

  it("keeps every existing row and value when applied to a database at 0010", () => {
    const raw = new DatabaseSync(":memory:");
    applyMigrations(raw, migrationFiles.slice(0, -1));
    seedRegistry(raw);
    const columnsBefore = Object.fromEntries(REGISTRY_TABLES.map((t) => [t, columns(raw, t).map((c) => String(c.name))]));
    const before = snapshot(raw, columnsBefore);

    applyMigrations(raw, [MIGRATION_0011]);

    expect(snapshot(raw, columnsBefore)).toEqual(before);
    for (const table of REGISTRY_TABLES) {
      const after = columns(raw, table).map((c) => String(c.name));
      expect(after.slice(0, columnsBefore[table]!.length), table).toEqual(columnsBefore[table]);
    }
    expect(raw.prepare("SELECT id, state FROM publishers ORDER BY id").all()).toEqual([
      { id: "pub-1", state: "active" },
      { id: "pub-2", state: "active" },
    ]);
    expect(raw.prepare("SELECT DISTINCT visibility FROM packages").all()).toEqual([{ visibility: "public" }]);
    expect(
      raw
        .prepare(
          "SELECT count(*) AS n FROM package_releases WHERE release_digest IS NULL AND file_count IS NULL AND tree_size IS NULL AND signed_manifest_key IS NULL AND quarantined_at IS NULL AND status_sequence IS NULL AND status_issued_at IS NULL",
        )
        .get(),
    ).toEqual({ n: 3 });
  });

  it("rolls back to the 0010 shape with the recorded SQL", () => {
    const raw = new DatabaseSync(":memory:");
    applyMigrations(raw, migrationFiles.slice(0, -1));
    seedRegistry(raw);
    const shapeBefore = Object.fromEntries(REGISTRY_TABLES.map((t) => [t, [columns(raw, t), indexes(raw, t)]]));
    const columnsBefore = Object.fromEntries(REGISTRY_TABLES.map((t) => [t, columns(raw, t).map((c) => String(c.name))]));
    const rowsBefore = snapshot(raw, columnsBefore);

    applyMigrations(raw, [MIGRATION_0011]);
    const rollback = rollbackSql(MIGRATION_0011);
    expect(rollback.length).toBeGreaterThan(0);
    for (const statement of rollback) raw.exec(statement);

    expect(Object.fromEntries(REGISTRY_TABLES.map((t) => [t, [columns(raw, t), indexes(raw, t)]]))).toEqual(shapeBefore);
    expect(snapshot(raw, columnsBefore)).toEqual(rowsBefore);
  });
});
