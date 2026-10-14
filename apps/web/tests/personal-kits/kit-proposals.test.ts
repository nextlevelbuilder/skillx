import { beforeEach, describe, expect, it, vi } from "vitest";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

let k: KitHarness;
let r1: { id: string; digest: string };
const MINE = { "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n")), "notes.md": "my notes\n" };
const BETTER = { ...MINE, "notes.md": "my notes\nprefer small steps\n" };
const ADMIN = { key: null, headers: { "X-Admin-Secret": "test-admin-secret-0123456789" } };
// Built at runtime so no credential-shaped literal sits in the source.
const FAKE_TOKEN = ["gh", "p_", "A".repeat(36)].join("");

beforeEach(async () => {
  session.user = null;
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", { "SKILL.md": skillText(BODY) });
  const res = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]) });
  r1 = res.body.revision;
});

async function proposal(files: Record<string, string>, extra: Record<string, unknown> = {}) {
  const e = await k.entry("@alpha/demo", "1.0.0", files);
  return {
    schema: "skillx.kit-proposal/v1",
    fromRevisionId: r1.id,
    skill: { identity: e.identity, base: e.base, overlay: e.overlay, compositionDigest: e.compositionDigest },
    declaredPermissions: [],
    visibility: "private",
    evidence: { summary: "Users repeatedly asked for smaller steps.", signals: { sessions: 3 } },
    ...extra,
  };
}

const submit = async (p: unknown, expectedGeneration = 1, idempotencyKey = k.idem()) => k.call("proposals", { expectedGeneration, idempotencyKey, proposal: p });
const untouched = () => expect([k.count("personal_kit_revisions"), k.count("personal_kit_proposals"), k.count("personal_kit_audit")]).toEqual([1, 0, 1]);

describe("session-derived proposals", () => {
  it("validates without writing anything", async () => {
    const res = await k.call("proposals/validate", { expectedGeneration: 0, proposal: await proposal(BETTER) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valid: true, state: "proposed", requiredPermissions: [], changedPaths: ["notes.md"], generation: 1, generationConflict: true });
    expect(res.body.revisionDigest).toMatch(/^sha256:/);
    untouched();
  });

  it("stores a private proposal that needs review, then approval with the exact permissions, before activation", async () => {
    const p = await proposal(BETTER);
    const first = await submit(p, 1, "proposal-key-1");
    expect(first.status).toBe(201);
    expect(first.body.revision).toMatchObject({ state: "proposed", origin: "session-derived", parentRevisionId: r1.id });
    const again = await submit(p, 1, "proposal-key-1");
    expect(again.status).toBe(200);
    expect(again.body.replayed).toBe(true);
    expect(k.count("personal_kit_proposals")).toBe(1);
    const rev = first.body.revision;

    const early = await k.call("activate", { expectedGeneration: 2, revisionId: rev.id, approval: { revisionDigest: rev.digest } });
    expect(early.body.error.code).toBe("kit.review_required");
    const view = await k.call(`revisions/${rev.id}/proposal`);
    expect(view.body).toMatchObject({ state: "proposed", identity: "@alpha/demo", declaredPermissions: [], requiredPermissions: [], evidence: { signals: { sessions: 3 } } });

    const approval = { revisionDigest: rev.digest, permissions: ["hooks"], visibility: "private", consent: true };
    const wrong = await k.call(`revisions/${rev.id}/review`, { expectedGeneration: 2, decision: "approve", approval });
    expect(wrong.body.error.code).toBe("kit.approval_required");
    const ok = await k.call(`revisions/${rev.id}/review`, { expectedGeneration: 2, decision: "approve", approval: { ...approval, permissions: [] } });
    expect(ok.body).toMatchObject({ state: "reviewed", generation: 3 });
    const act = await k.call("activate", { expectedGeneration: 3, revisionId: rev.id, approval: { revisionDigest: rev.digest } });
    expect(act.status).toBe(200);
    const stored = k.h.d1.raw.prepare("SELECT approval_json FROM personal_kit_revisions WHERE id = ?").get(rev.id) as { approval_json: string };
    expect(JSON.parse(stored.approval_json)).toMatchObject({ action: "activate", review: { action: "review", consent: true, permissions: [] } });
    expect(() => k.sql("UPDATE personal_kit_proposals SET identity = 'x'")).toThrow(/immutable/);
    expect(() => k.sql("DELETE FROM personal_kit_proposals")).toThrow(/never deleted/);
  });

  it("refuses raw session data, public visibility, secrets and local paths with nothing stored", async () => {
    const cases: Array<[unknown, string]> = [
      [{ ...(await proposal(BETTER)), transcript: "user: hi" }, "proposal.forbidden_field"],
      [{ ...(await proposal(BETTER)), evidence: { summary: "ok", messages: ["hi"] } }, "proposal.forbidden_field"],
      [await proposal(BETTER, { visibility: "public" }), "proposal.private_only"],
      [await proposal({ ...MINE, "notes.md": `token ${FAKE_TOKEN}\n` }), "proposal.content_refused"],
      [await proposal({ ...MINE, "notes.md": "see /home/alice/project\n" }), "proposal.content_refused"],
      [await proposal(BETTER, { evidence: { summary: "seen in C:\\Users\\alice\\repo" } }), "proposal.content_refused"],
      [await proposal(BETTER, { evidence: { summary: "x".repeat(2049) } }), "proposal.evidence_too_large"],
    ];
    for (const [p, code] of cases) {
      for (const sub of ["proposals", "proposals/validate"]) {
        const res = await k.call(sub, sub === "proposals" ? { expectedGeneration: 1, idempotencyKey: k.idem(), proposal: p } : { proposal: p });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe(code);
        const text = JSON.stringify(res.body);
        for (const leaked of [FAKE_TOKEN, "alice", "user: hi"]) expect(text).not.toContain(leaked);
      }
    }
    const refused = await submit(await proposal({ ...MINE, "notes.md": `token ${FAKE_TOKEN}\n` }));
    expect(refused.body.error.findings).toEqual(["danger:secret-github-token:notes.md"]);
    untouched();
  });

  it("needs every permission the change requires to be declared", async () => {
    const files = { ...MINE, "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n"), "name: demo\ndescription: Demo\nallowed-tools: Read Bash") };
    const res = await submit(await proposal(files));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: "proposal.undeclared_permission", required: ["allowed-tools:Bash"], missing: ["allowed-tools:Bash"] });
    untouched();
    const declared = await submit(await proposal(files, { declaredPermissions: ["allowed-tools:Bash"] }));
    expect(declared.status).toBe(201);
  });

  it("stores a proposal with other danger findings quarantined, never reviewable", async () => {
    const res = await submit(await proposal({ ...MINE, "notes.md": "[x](javascript:alert(1))\n" }));
    expect(res.status).toBe(201);
    expect(res.body.revision.state).toBe("quarantined");
    const view = await k.call(`revisions/${res.body.revision.id}/proposal`);
    expect(view.body.findings).toEqual(["danger:js-protocol:notes.md"]);
    const review = await k.call(`revisions/${res.body.revision.id}/review`, { expectedGeneration: 2, decision: "reject" });
    expect(review.body.error.code).toBe("kit.revision_unusable");
  });

  it("keeps proposals owner-only, guards lost updates and checks the base and skill", async () => {
    const p = await proposal(BETTER);
    expect((await k.call("proposals", { expectedGeneration: 1, idempotencyKey: k.idem(), proposal: p }, { key: k.otherKey })).status).toBe(404);
    expect((await k.call("proposals/validate", { proposal: { transcript: "x" } }, { key: k.otherKey })).status).toBe(404);
    const stale = await submit(p, 0);
    expect(stale.body.error.code).toBe("kit.generation_conflict");
    const base = await submit({ ...p, skill: { ...p.skill, base: { ...p.skill.base, version: "1.0.1" } } });
    expect(base.body.error.code).toBe("proposal.base_mismatch");
    const unknown = await submit({ ...p, skill: { ...p.skill, identity: "@alpha/other" } });
    expect(unknown.body.error.code).toBe("proposal.unknown_skill");
    untouched();

    const rev = (await submit(p)).body.revision;
    expect((await k.call(`revisions/${rev.id}/review`, { expectedGeneration: 2, decision: "reject" }, { key: k.otherKey })).status).toBe(404);
    expect((await k.call(`revisions/${rev.id}/review`, { expectedGeneration: 1, decision: "reject" })).body.error.code).toBe("kit.generation_conflict");
    expect((await k.call(`revisions/${r1.id}/review`, { expectedGeneration: 2, decision: "reject" })).body.error.code).toBe("kit.not_a_proposal");
    const rejected = await k.call(`revisions/${rev.id}/review`, { expectedGeneration: 2, decision: "reject" });
    expect(rejected.body).toMatchObject({ state: "rejected", generation: 3 });
    const act = await k.call("activate", { expectedGeneration: 3, revisionId: rev.id, approval: { revisionDigest: rev.digest } });
    expect(act.body.error.code).toBe("kit.revision_unusable");
  });

  it("lets only operators quarantine, and a quarantined effective revision fails the lock", async () => {
    await k.call("activate", { expectedGeneration: 1, revisionId: r1.id, approval: { revisionDigest: r1.digest } });
    const owner = await k.call(`revisions/${r1.id}/quarantine`, { reason: "report" });
    expect(owner.status).toBe(403);
    expect(owner.body.error.code).toBe("kit.admin_only");
    const admin = await k.call(`revisions/${r1.id}/quarantine`, { reason: "abuse report" }, ADMIN);
    expect(admin.status).toBe(200);
    expect(admin.body).toMatchObject({ state: "quarantined", effective: true, generation: 3 });
    const lock = await k.call("lock");
    expect(lock.status).toBe(409);
    expect(lock.body.error).toMatchObject({ code: "kit.locked_incompatible", reasons: ["the revision is quarantined"] });
    const audit = k.h.d1.raw.prepare("SELECT actor_kind, action FROM personal_kit_audit ORDER BY created_at DESC, rowid DESC LIMIT 1").get();
    expect(audit).toEqual({ actor_kind: "admin", action: "revision.quarantine" });
    expect((await k.call("", undefined, ADMIN)).status).toBe(401);
  });
});
