/**
 * Activation gate of session-derived content. A revision with a
 * session-derived revision anywhere in its history, whatever its own origin
 * (manual, rebase, resolution), also through the revision of a parent kit
 * its document names, or with a parent that cannot be read,
 * activates (and rolls back) only from a web session and only as a private
 * document on a private kit. Any activation that makes a kit public needs a
 * web session too; other private activations keep working with an API key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

type Rev = { id: string; digest: string };
let k: KitHarness;
let manual: Rev;
const WEB = { key: null };
const MINE = { "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n")), "notes.md": "my notes\n" };
const LEARNED = { ...MINE, "notes.md": "my notes\nprefer small steps\n" };
const v2 = (from: string, to: string) => ({ "SKILL.md": skillText(BODY.replace(from, to)) });
const gated = (res: { status: number; body: Record<string, any> }) => {
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe("kit.interactive_approval_required");
};

beforeEach(async () => {
  session.user = { id: "user-a" };
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", { "SKILL.md": skillText(BODY) });
  manual = (await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]) })).body.revision;
});

/** A reviewed session-derived revision of the kit; returns it and the kit generation after the review. */
async function reviewedProposal(): Promise<{ rev: Rev; generation: number }> {
  const e = await k.entry("@alpha/demo", "1.0.0", LEARNED);
  const proposal = { schema: "skillx.kit-proposal/v1", fromRevisionId: manual.id, skill: { identity: e.identity, base: e.base, overlay: e.overlay, compositionDigest: e.compositionDigest }, declaredPermissions: [], visibility: "private" };
  const rev = (await k.call("proposals", { expectedGeneration: 1, idempotencyKey: k.idem(), proposal })).body.revision as Rev;
  const review = await k.call(`revisions/${rev.id}/review`, { expectedGeneration: 2, decision: "approve", approval: { revisionDigest: rev.digest, permissions: [], visibility: "private", consent: true } }, WEB);
  expect(review.status).toBe(200);
  return { rev, generation: review.body.generation };
}

const activation = (rev: Rev, generation: number) => ({ expectedGeneration: generation, revisionId: rev.id, approval: { revisionDigest: rev.digest } });

/** The reviewed proposal, made effective from a web session; returns the generation after it. */
async function effectiveProposal(): Promise<{ rev: Rev; generation: number }> {
  const { rev, generation } = await reviewedProposal();
  const act = await k.call("activate", activation(rev, generation), WEB);
  expect(act.status).toBe(200);
  return { rev, generation: act.body.generation };
}

/** A manual revision; its parent is the effective revision. */
async function manualRevision(generation: number, note: string, visibility = "private") {
  const document = k.doc([await k.entry("@alpha/demo", "1.0.0", { ...LEARNED, "notes.md": note })], { visibility });
  const res = await k.call("revisions", { expectedGeneration: generation, idempotencyKey: k.idem(), document });
  expect(res.status).toBe(201);
  return { rev: res.body.revision as Rev & { parentRevisionId: string }, generation: res.body.generation as number };
}

const rebase = (fromRevisionId: string, version: string, expectedGeneration: number) =>
  k.call("rebase", { expectedGeneration, idempotencyKey: k.idem(), fromRevisionId, updates: [{ package: "@alpha/demo", version }] });

/** Activation by API key is refused with the interactive gate; a web session then activates. */
async function expectWebOnly(rev: Rev, generation: number, action = "activate") {
  gated(await k.call(action, activation(rev, generation)));
  const byWeb = await k.call(action, activation(rev, generation), WEB);
  expect(byWeb.status).toBe(200);
  const stored = k.h.d1.raw.prepare("SELECT approval_json FROM personal_kit_revisions WHERE id = ?").get(rev.id) as { approval_json: string };
  expect(JSON.parse(stored.approval_json)).toMatchObject({ credential: "web-session" });
  return byWeb.body.generation as number;
}

describe("revisions derived from a proposal", () => {
  it("gates a rebase draft of a reviewed proposal, also through a chain of rebases", async () => {
    const { rev, generation } = await reviewedProposal();
    await k.publish("@alpha/demo", "2.0.0", v2("eight\n", "eight (v2)\n"));
    const first = await rebase(rev.id, "2.0.0", generation);
    expect(first.body.revision).toMatchObject({ state: "draft", origin: "rebase", parentRevisionId: rev.id });
    await k.publish("@alpha/demo", "3.0.0", v2("seven\n", "seven (v3)\n"));
    const second = await rebase(first.body.revision.id, "3.0.0", first.body.generation);
    expect(second.body.revision).toMatchObject({ origin: "rebase", parentRevisionId: first.body.revision.id });
    await expectWebOnly(second.body.revision, second.body.generation);
  });

  it("gates a conflict resolution of a reviewed proposal", async () => {
    const { rev, generation } = await reviewedProposal();
    await k.publish("@alpha/demo", "2.0.0", v2("two\n", "two (v2)\n"));
    const clash = await rebase(rev.id, "2.0.0", generation);
    expect(clash.body.status).toBe("needs-review");
    const merged = await k.overlayTo("@alpha/demo", "2.0.0", { ...LEARNED, "SKILL.md": skillText(BODY.replace("two\n", "two (mine, v2)\n")) });
    const res = await k.call(`conflicts/${clash.body.conflictId}/resolve`, {
      expectedGeneration: clash.body.generation,
      idempotencyKey: k.idem(),
      approvedBy: "user",
      decisions: [{ identity: "@alpha/demo", choice: "edit-overlay", ...merged }],
    });
    expect(res.status).toBe(201);
    expect(res.body.revision).toMatchObject({ origin: "resolution", parentRevisionId: rev.id });
    await expectWebOnly(res.body.revision, res.body.generation);
  });

  it("gates a manual revision stored over an effective proposal, and a rebase of it", async () => {
    const { rev, generation } = await effectiveProposal();
    const next = await manualRevision(generation, "edited by hand\n");
    expect(next.rev).toMatchObject({ origin: "manual", parentRevisionId: rev.id });
    const after = await expectWebOnly(next.rev, next.generation);
    await k.publish("@alpha/demo", "2.0.0", v2("eight\n", "eight (v2)\n"));
    const rebased = await rebase(next.rev.id, "2.0.0", after);
    expect(rebased.body.revision).toMatchObject({ origin: "rebase", parentRevisionId: next.rev.id });
    await expectWebOnly(rebased.body.revision, rebased.body.generation);
  });

  it("gates a rollback onto a session-derived revision", async () => {
    const { rev, generation } = await effectiveProposal();
    const next = await manualRevision(generation, "edited by hand\n");
    const after = await expectWebOnly(next.rev, next.generation);
    await expectWebOnly(rev, after, "rollback");
  });

  it("keeps a revision derived from a proposal private, even from a web session", async () => {
    const { generation } = await effectiveProposal();
    const pub = await manualRevision(generation, "published\n", "public");
    const act = await k.call("activate", activation(pub.rev, pub.generation), WEB);
    expect(act.status).toBe(409);
    expect(act.body.error.code).toBe("proposal.private_kit_required");
  });

  it("gates a revision whose parent cannot be read (fails closed)", async () => {
    await k.publish("@alpha/demo", "2.0.0", v2("eight\n", "eight (v2)\n"));
    const res = await rebase(manual.id, "2.0.0", 1);
    expect(res.status).toBe(201);
    k.sql("DROP TRIGGER personal_kit_revisions_immutable");
    k.sql("UPDATE personal_kit_revisions SET parent_revision_id = ? WHERE id = ?", "pkr_00000000-0000-0000-0000-000000000000", manual.id);
    gated(await k.call("activate", activation(res.body.revision, res.body.generation)));
  });

  it("gates a kit whose document parent is a session-derived revision of another kit", async () => {
    const { rev } = await reviewedProposal();
    const CHILD = { kit: "@alpha/child" };
    const document = k.doc([], { kit: CHILD.kit, localId: "local/child", parent: { kit: "@alpha/my-kit", revisionDigest: rev.digest } });
    const stored = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document }, CHILD);
    expect(stored.status).toBe(201);
    const child = stored.body.revision as Rev;
    gated(await k.call("activate", activation(child, 1), CHILD));
    const byWeb = await k.call("activate", activation(child, 1), { ...WEB, ...CHILD });
    expect(byWeb.status).toBe(200);
  });
});

describe("activations without session-derived content", () => {
  it("keeps API-key activation for private drafts that descend from manual revisions", async () => {
    await k.publish("@alpha/demo", "2.0.0", v2("eight\n", "eight (v2)\n"));
    const res = await rebase(manual.id, "2.0.0", 1);
    expect(res.status).toBe(201);
    const act = await k.call("activate", activation(res.body.revision, res.body.generation));
    expect(act.status).toBe(200);
  });

  it("makes a kit public only from a web session", async () => {
    const pub = await manualRevision(1, "published\n", "public");
    await expectWebOnly(pub.rev, pub.generation);
    expect((await k.call("")).body.visibility).toBe("public");
  });

  it("creates every kit private, also from a public first document", async () => {
    const CHILD = { kit: "@alpha/child" };
    const document = k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)], { kit: CHILD.kit, localId: "local/child", visibility: "public" });
    const res = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document }, CHILD);
    expect(res.status).toBe(201);
    expect((await k.call("", undefined, CHILD)).body.visibility).toBe("private");
    gated(await k.call("activate", activation(res.body.revision, 1), CHILD));
  });
});
