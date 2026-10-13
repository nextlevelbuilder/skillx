/**
 * A D1Database stand-in over node:sqlite with every migration applied, for
 * the release API tests. It implements the subset the release path uses:
 * prepare/bind/first/all/run and an atomic batch.
 */
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle/migrations", import.meta.url));

type Value = string | number | null | bigint | Uint8Array;

class FakeStatement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    readonly params: Value[] = [],
  ) {}

  bind(...params: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, params as Value[]);
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[] };
  }

  /** Rows as value arrays (used by drizzle-orm's D1 driver for selects). */
  async raw<T>(): Promise<T[]> {
    return (this.db.prepare(this.sql).all(...this.params) as Array<Record<string, unknown>>).map((row) => Object.values(row) as T);
  }

  runSync() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(info.changes) } };
  }

  async run() {
    return this.runSync();
  }
}

export class FakeD1 {
  readonly raw = new DatabaseSync(":memory:");

  constructor() {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      for (const statement of readFileSync(join(MIGRATIONS_DIR, file), "utf-8").split("--> statement-breakpoint")) {
        if (statement.trim() !== "") this.raw.exec(statement);
      }
    }
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.raw, sql);
  }

  /** Atomic like D1: every statement commits, or none does. */
  async batch(statements: FakeStatement[]) {
    this.raw.exec("BEGIN");
    try {
      const results = statements.map((s) => s.runSync());
      this.raw.exec("COMMIT");
      return results;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}
