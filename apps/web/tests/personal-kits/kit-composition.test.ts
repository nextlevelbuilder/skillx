import { beforeEach, describe, expect, it, vi } from "vitest";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

vi.mock("~/lib/auth/session-helpers", () => ({ getSession: async () => null }));

let k: KitHarness;
const V1 = { "SKILL.md": skillText(BODY) };
const V2 = { "SKILL.md": skillText(BODY.replace("eight\n", "eight (v2)\n")) };
const MINE = { "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n")) };
const D = (c: string) => `sha256:${c.repeat(64)}`;

const COMPOSITION = {
  extends: [{ kit: "engineer", version: "3.1.0" }],
  include: ["@alpha/demo"],
  resolutions: [
    {
      identity: "@alpha/demo", path: "SKILL.md", category: "conflict.same_hunk", baseFrom: D("1"), baseTo: D("2"), baseTreeFrom: D("3"), baseTreeTo: D("4"),
      choice: "keep-old", overlayDigestAfter: D("5"), kit: "engineer", fromVersion: "3.0.0", toVersion: "3.1.0", planToken: "plan-0001", approvedBy: "user",
    },
  ],
};

beforeEach(async () => {
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", V1);
});

describe("revision composition", () => {
  it("stores composition verbatim under the revision digest, returns it on read and diffs it", async () => {
    const plain = k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]);
    const r1 = (await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: plain })).body.revision;
    const composed = { ...plain, composition: COMPOSITION };
    const res = await k.call("revisions", { expectedGeneration: 1, idempotencyKey: k.idem(), document: composed });
    expect(res.status).toBe(201);
    expect(res.body.revision.digest).not.toBe(r1.digest);
    const read = await k.call(`revisions/${res.body.revision.id}`);
    expect(read.body.document.composition).toEqual(COMPOSITION);
    const diff = await k.call(`diff?from=${r1.id}&to=${res.body.revision.id}`);
    expect(diff.body.document).toEqual(["composition"]);
    expect(diff.body.changed).toEqual([]);
  });

  it("refuses an invalid composition with kit.invalid and writes nothing", async () => {
    const document = { ...k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]), composition: { ...COMPOSITION, extends: [] } };
    const res = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("kit.invalid");
    expect(res.body.error.message).toMatch(/^composition\.extends/);
    expect(k.count("personal_kits") + k.count("personal_kit_revisions")).toBe(0);
  });

  it("drops composition from a server-built rebase revision, whose pins its records no longer describe", async () => {
    const document = { ...k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]), composition: COMPOSITION };
    const rev = (await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document })).body.revision;
    await k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } });
    await k.publish("@alpha/demo", "2.0.0", V2);
    const rebased = await k.call("rebase", { expectedGeneration: 2, idempotencyKey: k.idem(), updates: [{ package: "@alpha/demo", version: "2.0.0" }] });
    expect(rebased.status).toBe(201);
    const doc = (await k.call(`revisions/${rebased.body.revision.id}`)).body.document;
    expect(doc.skills[0].base.version).toBe("2.0.0");
    expect(doc.composition).toBeUndefined();
  });
});
