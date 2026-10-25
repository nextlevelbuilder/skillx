import { describe, expect, it } from "vitest";
import { MAX_LOOKUP_NAMES, readablePackageNames } from "~/lib/releases/release-access";

/** A database that records what is asked and answers nothing. */
function recordingDb() {
  const prepared: string[] = [];
  const batches: Array<Array<{ args: unknown[] }>> = [];
  const db = {
    prepare: (sql: string) => {
      prepared.push(sql);
      return { bind: (...args: unknown[]) => ({ args }) };
    },
    batch: async (statements: Array<{ args: unknown[] }>) => {
      batches.push(statements);
      return statements.map(() => ({ results: [] }));
    },
  } as unknown as D1Database;
  return { db, prepared, batches };
}

const lookedUp = (batches: Array<Array<{ args: unknown[] }>>) => batches.flatMap((b) => b.flatMap((s) => s.args.slice(2) as string[]));

describe("readablePackageNames", () => {
  it("looks every distinct name up once, in one batch", async () => {
    const { db, batches } = recordingDb();
    const names = Array.from({ length: 120 }, (_, i) => `@a/p${i % 60}`);
    const readable = await readablePackageNames(db, names, "user-x");
    expect(readable.size).toBe(0);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    const asked = lookedUp(batches);
    expect(asked).toHaveLength(60);
    expect(new Set(asked).size).toBe(60);
  });

  it("asks nothing for no names", async () => {
    const { db, batches, prepared } = recordingDb();
    await readablePackageNames(db, [], null);
    expect(batches).toEqual([]);
    expect(prepared).toEqual([]);
  });

  it("caps the distinct names of one call", async () => {
    const { db, batches } = recordingDb();
    await readablePackageNames(db, Array.from({ length: MAX_LOOKUP_NAMES + 500 }, (_, i) => `@a/p${i}`), null);
    expect(batches).toHaveLength(1);
    expect(lookedUp(batches)).toHaveLength(MAX_LOOKUP_NAMES);
  });
});
