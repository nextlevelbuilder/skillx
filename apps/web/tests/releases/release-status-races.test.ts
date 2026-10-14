import { beforeEach, describe, expect, it } from "vitest";
import { createHarness } from "./release-harness";
import { at, statusHelpers } from "./release-status-helpers";
import type { Harness } from "./release-status-helpers";

let h: Harness;
let s: ReturnType<typeof statusHelpers>;

beforeEach(async () => {
  h = await createHarness();
  s = statusHelpers(h);
});

const storedKey = () => (h.d1.raw.prepare("SELECT status_key FROM package_releases").get() as { status_key: string }).status_key;
const objects = () => (h.deps.bucket as unknown as { objects: Map<string, unknown> }).objects;

describe("release status races", () => {
  it("a compare-and-set loser serves the winner when it reports the same state", async () => {
    await s.publish();
    let winner: Awaited<ReturnType<typeof s.status>> | undefined;
    const race = s.racingDb(async (attempt) => {
      if (attempt === 0) winner = await s.status(at(1));
    });
    const loser = await s.status(at(1), { db: race.db });
    expect(race.attempts()).toBe(1);
    expect(loser.bytes).toEqual(winner!.bytes);
    expect(loser.doc.sequence).toBe(1);
  });

  it("a loser never serves a winner that reports another state", async () => {
    await s.publish();
    let releaseWinner!: () => void;
    const winnerMayRecord = new Promise<void>((resolve) => (releaseWinner = resolve));
    let winnerRecorded!: () => void;
    const recorded = new Promise<void>((resolve) => (winnerRecorded = resolve));
    // The winner observes `published`, then records only after the yank and the loser's read.
    let winnerReached!: () => void;
    const reached = new Promise<void>((resolve) => (winnerReached = resolve));
    const winnerDb = s.racingDb(
      () => (winnerReached(), winnerMayRecord),
      () => winnerRecorded(),
    );
    const winner = s.status(at(1), { db: winnerDb.db });
    await reached;
    s.sql("UPDATE package_releases SET release_state = 'yanked', yanked_at = 2");
    const loserDb = s.racingDb(async (attempt) => {
      if (attempt === 0) {
        releaseWinner();
        await recorded;
      }
    });
    const loser = await s.status(at(1), { db: loserDb.db });
    expect((await winner).doc).toMatchObject({ state: "published", sequence: 1 });
    expect(loserDb.attempts()).toBe(2);
    expect(loser.doc).toMatchObject({ state: "yanked", reason: "yanked", sequence: 2 });
    expect(await s.verify(loser.bytes, at(1), (await winner).doc)).toMatchObject({ valid: true });
  });

  it("answers 503 after repeatedly losing to state changes", async () => {
    await s.publish();
    let yanked = false;
    const race = s.racingDb(async () => {
      await s.status(at(1));
      yanked = !yanked;
      s.sql(`UPDATE package_releases SET release_state = '${yanked ? "yanked" : "published"}', yanked_at = ${yanked ? 2 : "NULL"}`);
    });
    await expect(s.status(at(1), { db: race.db })).rejects.toMatchObject({ status: 503, code: "release.status_contended" });
    expect(race.attempts()).toBe(3);
  });
});

describe("release status recovery", () => {
  it("keeps the sequence monotonic when the stored pointer is lost (migration rollback and reapply)", async () => {
    await s.publish();
    const first = await s.status(at(1));
    s.sql("UPDATE package_releases SET status_key = NULL");
    const next = await s.status(at(1));
    expect(next.doc).toMatchObject({ state: "published", sequence: 5 });
    expect(Date.parse(next.doc.issuedAt)).toBe(Date.parse(first.doc.issuedAt) + 1000);
    expect(await s.verify(next.bytes, at(1), first.doc)).toMatchObject({ valid: true });
  });

  it("re-issues when the stored object is missing or corrupt instead of failing", async () => {
    await s.publish();
    const first = await s.status(at(1));
    objects().delete(storedKey());
    const afterMissing = await s.status(at(2));
    expect(afterMissing.doc.sequence).toBe(5);
    expect(await s.verify(afterMissing.bytes, at(2), first.doc)).toMatchObject({ valid: true });

    await h.deps.bucket.put(storedKey(), new TextEncoder().encode("{not json"));
    const afterCorrupt = await s.status(at(3));
    expect(afterCorrupt.doc.sequence).toBe(9);
    expect(await s.verify(afterCorrupt.bytes, at(3), afterMissing.doc)).toMatchObject({ valid: true });
  });
});
