/**
 * Safety rules of session-derived proposals: no chaining on an unreviewed
 * proposal, only what a change introduces is scanned, binary and BOM content
 * is refused, declared permissions equal the required ones, review and
 * activation need a web session, proposals stay on private kits, quarantined
 * parents fail the lock, database guards and the nesting bound.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

let k: KitHarness;
let r1: { id: string; digest: string };
const WEB = { key: null };
const ADMIN = { key: null, headers: { "X-Admin-Secret": "test-admin-secret-0123456789" } };
const SKILL = skillText(BODY.replace("two\n", "two (mine)\n"));
const MINE = { "SKILL.md": SKILL, "notes.md": "my notes\nexample: /home/alice/project\n" };
const with_ = (notes: string) => ({ ...MINE, "notes.md": `${MINE["notes.md"]}${notes}` });

beforeEach(async () => {
  session.user = { id: "user-a" };
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", { "SKILL.md": skillText(BODY) });
  r1 = (await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]) })).body.revision;
});

async function proposal(files: Record<string, string>, fromRevisionId = r1.id, extra: Record<string, unknown> = {}) {
  const e = await k.entry("@alpha/demo", "1.0.0", files);
  return { schema: "skillx.kit-proposal/v1", fromRevisionId, skill: { identity: e.identity, base: e.base, overlay: e.overlay, compositionDigest: e.compositionDigest }, declaredPermissions: [], visibility: "private", ...extra };
}

const submit = async (p: unknown, expectedGeneration: number, o: Record<string, unknown> = {}) => k.call("proposals", { expectedGeneration, idempotencyKey: k.idem(), proposal: p }, o);
const approve = (rev: { id: string; digest: string }, generation: number, o: Record<string, unknown> = WEB) =>
  k.call(`revisions/${rev.id}/review`, { expectedGeneration: generation, decision: "approve", approval: { revisionDigest: rev.digest, permissions: [], visibility: "private", consent: true } }, o);

describe("proposal lineage", () => {
  it("refuses chaining on an unreviewed proposal, and allows it once reviewed", async () => {
    const a = (await submit(await proposal(with_("step A\n")), 1)).body.revision;
    expect(a.state).toBe("proposed");
    const chained = await submit(await proposal(with_("step A\nstep B\n"), a.id), 2);
    expect(chained.status).toBe(409);
    expect(chained.body.error.code).toBe("kit.review_required");
    expect((await approve(a, 2)).status).toBe(200);
    const b = await submit(await proposal(with_("step A\nstep B\n"), a.id), 3);
    expect(b.status).toBe(201);
    expect(b.body.revision.parentRevisionId).toBe(a.id);
  });

  it("never uses an unreviewed proposal as a parent kit revision", async () => {
    const a = (await submit(await proposal(with_("step A\n")), 1)).body.revision;
    const document = k.doc([], { kit: "@alpha/child", localId: "local/child", parent: { kit: "@alpha/my-kit", revisionDigest: a.digest } });
    const res = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document }, { kit: "@alpha/child" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("kit.base_unavailable");
  });
});

describe("proposal content", () => {
  it("scans only what the change introduces", async () => {
    const ok = await k.call("proposals/validate", { proposal: await proposal(with_("prefer small steps\n")) });
    expect(ok.status).toBe(200);
    const leaked = await k.call("proposals/validate", { proposal: await proposal(with_(String.raw`log at C:\\Users\\bob\\x` + "\n")) });
    expect(leaked.body.error).toMatchObject({ code: "proposal.content_refused", findings: ["danger:local-path:notes.md"] });
    const secret = await k.call("proposals/validate", { proposal: await proposal(with_("password=" + "hunter22\n")) });
    expect(secret.body.error.findings).toEqual(["danger:secret-password:notes.md"]);
  });

  it("refuses binary and byte-order-mark content", async () => {
    const binary = await k.call("proposals/validate", { proposal: await proposal({ ...MINE, "data.bin": "a\u0000b" }) });
    expect(binary.body.error).toMatchObject({ code: "proposal.content_refused", findings: ["danger:binary-content:data.bin"] });
    const bom = await k.call("proposals/validate", { proposal: await proposal({ ...MINE, "extra.md": "\uFEFFhello\n" }) });
    expect(bom.body.error.findings).toEqual(["danger:byte-order-mark:extra.md"]);
  });

  it("refuses declared permissions the change does not need", async () => {
    const res = await k.call("proposals/validate", { proposal: await proposal(with_("x\n"), r1.id, { declaredPermissions: ["hooks"] }) });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: "proposal.excess_permission", required: [], extra: ["hooks"] });
  });

  it("bounds the request nesting", async () => {
    let deep: unknown = {};
    for (let i = 0; i < 40; i++) deep = { a: deep };
    const res = await k.call("proposals/validate", { proposal: deep });
    expect(res.status).toBe(400);
  });
});

describe("proposal approval", () => {
  it("needs a web session to review or activate; the API key that submits cannot", async () => {
    const rev = (await submit(await proposal(with_("x\n")), 1)).body.revision;
    const byKey = await approve(rev, 2, {});
    expect(byKey.status).toBe(403);
    expect(byKey.body.error.code).toBe("kit.interactive_approval_required");
    expect((await approve(rev, 2)).status).toBe(200);
    const activateByKey = await k.call("activate", { expectedGeneration: 3, revisionId: rev.id, approval: { revisionDigest: rev.digest } });
    expect(activateByKey.body.error.code).toBe("kit.interactive_approval_required");
    const act = await k.call("activate", { expectedGeneration: 3, revisionId: rev.id, approval: { revisionDigest: rev.digest } }, WEB);
    expect(act.status).toBe(200);
    const stored = k.h.d1.raw.prepare("SELECT approval_json FROM personal_kit_revisions WHERE id = ?").get(rev.id) as { approval_json: string };
    expect(JSON.parse(stored.approval_json)).toMatchObject({ credential: "web-session", review: { credential: "web-session" } });
  });

  it("keeps proposals on private kits: refused on a public kit, never activated after the kit turned public", async () => {
    const rev = (await submit(await proposal(with_("x\n")), 1)).body.revision;
    await approve(rev, 2);
    const pub = (await k.call("revisions", { expectedGeneration: 3, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)], { visibility: "public" }) })).body.revision;
    expect((await k.call("activate", { expectedGeneration: 4, revisionId: pub.id, approval: { revisionDigest: pub.digest } })).status).toBe(200);
    const act = await k.call("activate", { expectedGeneration: 5, revisionId: rev.id, approval: { revisionDigest: rev.digest } }, WEB);
    expect(act.status).toBe(409);
    expect(act.body.error.code).toBe("proposal.private_kit_required");
    const again = await submit(await proposal(with_("y\n"), pub.id), 5);
    expect(again.body.error.code).toBe("proposal.private_kit_required");
  });
});

describe("guards", () => {
  it("fails the lock with kit.locked_incompatible when a parent revision is quarantined", async () => {
    const parentDoc = { ...k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]), kit: "@alpha/parent", localId: "local/parent" };
    const parent = (await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: parentDoc }, { kit: "@alpha/parent" })).body.revision;
    const document = k.doc([], { kit: "@alpha/child", localId: "local/child", parent: { kit: "@alpha/parent", revisionDigest: parent.digest } });
    const childRev = (await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document }, { kit: "@alpha/child" })).body.revision;
    expect((await k.call("activate", { expectedGeneration: 1, revisionId: childRev.id, approval: { revisionDigest: childRev.digest } }, { kit: "@alpha/child" })).status).toBe(200);
    expect((await k.call(`revisions/${parent.id}/quarantine`, { reason: "abuse" }, { ...ADMIN, kit: "@alpha/parent" })).status).toBe(200);
    const lock = await k.call("lock", undefined, { kit: "@alpha/child" });
    expect(lock.status).toBe(409);
    expect(lock.body.error.code).toBe("kit.locked_incompatible");
    expect(lock.body.error.reasons[0]).toMatch(/quarantined/);
  });

  it("enforces final states and the review proof in the database", async () => {
    const rev = (await submit(await proposal(with_("x\n")), 1)).body.revision;
    expect(() => k.sql("UPDATE personal_kit_revisions SET state = 'reviewed' WHERE id = ?", rev.id)).toThrow(/review proof/);
    await k.call(`revisions/${rev.id}/review`, { expectedGeneration: 2, decision: "reject" }, WEB);
    expect(() => k.sql("UPDATE personal_kit_revisions SET state = 'draft' WHERE id = ?", rev.id)).toThrow(/not allowed/);
    expect(() => k.sql("UPDATE personal_kit_revisions SET state = 'reviewed' WHERE id = ?", r1.id)).not.toThrow();
    expect(() => k.sql("UPDATE personal_kit_revisions SET state = 'proposed' WHERE id = ?", r1.id)).toThrow(/not allowed/);
  });
});
