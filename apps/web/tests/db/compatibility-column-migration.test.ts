/**
 * The `skills.compatibility_json` migration keeps the name production recorded.
 *
 * Production D1 already has the column and lists `0010_greedy_famine.sql` in
 * `d1_migrations` (it was applied from an earlier branch). `wrangler d1
 * migrations apply` decides what is pending by file name, so the migration must
 * keep exactly that name: a new name would be re-applied and fail with a
 * duplicate column. See docs/deployment-guide.md.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FakeD1 } from "../releases/fake-d1";

const MIGRATIONS_DIR = new URL("../../drizzle/migrations/", import.meta.url);

describe("compatibility_json migration", () => {
  it("is the file production already recorded, adding only the nullable column", () => {
    const sql = readFileSync(fileURLToPath(new URL("0010_greedy_famine.sql", MIGRATIONS_DIR)), "utf-8");
    expect(sql.trim()).toBe("ALTER TABLE `skills` ADD `compatibility_json` text;");
  });

  it("is registered in the drizzle journal under the same tag", () => {
    const journal = JSON.parse(readFileSync(fileURLToPath(new URL("meta/_journal.json", MIGRATIONS_DIR)), "utf-8")) as {
      entries: Array<{ tag: string }>;
    };
    expect(journal.entries.filter((e) => e.tag === "0010_greedy_famine")).toHaveLength(1);
  });

  it("applies on a fresh database as a nullable text column", () => {
    const db = new FakeD1();
    const columns = db.raw.prepare("PRAGMA table_info(skills)").all() as Array<{ name: string; type: string; notnull: number }>;
    const column = columns.find((c) => c.name === "compatibility_json");
    expect(column).toMatchObject({ type: "TEXT", notnull: 0 });
  });
});
