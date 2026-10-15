/**
 * A rebase or conflict-resolution draft that carries a reviewed
 * session-derived revision forward inherits its activation gate: only a
 * web session activates it, never the API key that submitted the proposal.
 * Drafts that descend from manual revisions keep activating with a key.
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

const rebase = (fromRevisionId: string, version: string, expectedGeneration: number) =>
  k.call("rebase", { expectedGeneration, idempotencyKey: k.idem(), fromRevisionId, updates: [{ package: "@alpha/demo", version }] });

/** Activation by API key is refused with the interactive gate; a web session then activates. */
async function expectWebOnly(rev: Rev, generation: number) {
  const body = { expectedGeneration: generation, revisionId: rev.id, approval: { revisionDigest: rev.digest } };
  const byKey = await k.call("activate", body);
  expect(byKey.status).toBe(403);
  expect(byKey.body.error.code).toBe("kit.interactive_approval_required");
  const byWeb = await k.call("activate", body, WEB);
  expect(byWeb.status).toBe(200);
  const stored = k.h.d1.raw.prepare("SELECT approval_json FROM personal_kit_revisions WHERE id = ?").get(rev.id) as { approval_json: string };
  expect(JSON.parse(stored.approval_json)).toMatchObject({ credential: "web-session" });
}

describe("activation gate of revisions derived from a proposal", () => {
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

  it("keeps API-key activation for drafts that descend from manual revisions", async () => {
    await k.publish("@alpha/demo", "2.0.0", v2("eight\n", "eight (v2)\n"));
    const res = await rebase(manual.id, "2.0.0", 1);
    expect(res.status).toBe(201);
    const draft = res.body.revision as Rev;
    const act = await k.call("activate", { expectedGeneration: res.body.generation, revisionId: draft.id, approval: { revisionDigest: draft.digest } });
    expect(act.status).toBe(200);
  });
});
