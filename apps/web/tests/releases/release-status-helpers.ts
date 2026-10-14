import { expect } from "vitest";
import { verifyReleaseStatus } from "@skillx/contracts";
import type { SkillxReleaseManifest, SkillxReleaseStatus } from "@skillx/contracts";
import { readReleaseStatus } from "~/lib/releases/release-status-issue";
import { NOW, TEST_KEY_ID, createHarness, file, tarOf } from "./release-harness";

export type Harness = Awaited<ReturnType<typeof createHarness>>;

const HOUR = 3600_000;
export const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

/** Status-endpoint helpers bound to one harness. */
export function statusHelpers(h: Harness) {
  const sql = (statement: string, ...params: Array<string | number | null>) => h.d1.raw.prepare(statement).run(...params);

  async function publish(name = "@alpha/demo", version = "1.0.0") {
    const res = await h.upload(name, tarOf([file("SKILL.md", "---\nname: demo\ndescription: Demo skill\n---\n# Demo\n")]), { version });
    expect(res.status).toBe(200);
    return res.body;
  }

  async function status(now: Date, opts: { name?: string; version?: string; userId?: string | null; db?: D1Database } = {}) {
    const name = opts.name ?? "@alpha/demo";
    const version = opts.version ?? "1.0.0";
    const [scope, slug] = name.split("/") as [string, string];
    const request = new Request(`https://skillx.test/api/v1/packages/${name}/releases/${version}/status`);
    const ctx = { db: opts.db ?? h.deps.db, bucket: h.deps.bucket, userId: opts.userId ?? null, request };
    const res = await readReleaseStatus(ctx, { scope, slug, version }, { loadSigner: h.deps.loadSigner, activeKeyId: TEST_KEY_ID, now: () => now });
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { res, bytes, doc: JSON.parse(new TextDecoder().decode(bytes)) as SkillxReleaseStatus };
  }

  async function manifestOf(): Promise<SkillxReleaseManifest> {
    const row = h.releaseRows().find((r) => r.name === "@alpha/demo" && r.version === "1.0.0")!;
    const object = await h.deps.bucket.get(row.signed_manifest_key as string);
    return JSON.parse(new TextDecoder().decode(await object!.arrayBuffer())) as SkillxReleaseManifest;
  }

  async function verify(bytes: Uint8Array, now: Date, previous: SkillxReleaseStatus | null = null) {
    const keys = new Map([[TEST_KEY_ID, h.signingKey.publicKey]]);
    return verifyReleaseStatus(bytes, keys, { manifest: await manifestOf(), now, previous });
  }

  /**
   * A D1 whose status compare-and-set runs `before(attempt)` first and
   * `after()` once it has run, to interleave a concurrent request.
   */
  function racingDb(before: (attempt: number) => Promise<void>, after: () => void = () => {}): { db: D1Database; attempts: () => number } {
    let attempts = 0;
    const base = h.deps.db;
    const db = {
      prepare(query: string) {
        const statement = base.prepare(query);
        if (!query.startsWith("UPDATE package_releases SET status_sequence")) return statement;
        return {
          bind: (...args: unknown[]) => {
            const bound = statement.bind(...args);
            return {
              run: async () => {
                await before(attempts++);
                const result = await bound.run();
                after();
                return result;
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    return { db, attempts: () => attempts };
  }

  return { sql, publish, status, verify, racingDb };
}
