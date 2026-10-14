import { beforeEach, describe, expect, it, vi } from "vitest";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

vi.mock("~/lib/auth/session-helpers", () => ({ getSession: async () => null }));

let k: KitHarness;
const V1 = { "SKILL.md": skillText(BODY) };
const MINE = { "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n")) };
const V2_CLEAN = { "SKILL.md": skillText(BODY.replace("eight\n", "eight (v2)\n")) };
const V2_CLASH = { "SKILL.md": skillText(BODY.replace("two\n", "two (v2)\n")) };
const UPDATE = [{ package: "@alpha/demo", version: "2.0.0" }];

beforeEach(async () => {
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", V1);
});

/** A kit whose effective revision overlays `@alpha/demo@1.0.0` with MINE. */
async function activeKit() {
  const created = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]) });
  const rev = created.body.revision;
  const ok = await k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } });
  expect(ok.status).toBe(200);
  return rev as { id: string; digest: string };
}

async function openConflict() {
  await k.publish("@alpha/demo", "2.0.0", V2_CLASH);
  const from = await activeKit();
  const res = await k.call("rebase", { expectedGeneration: 2, idempotencyKey: k.idem(), updates: UPDATE });
  expect(res.body.status).toBe("needs-review");
  return { from, conflictId: res.body.conflictId as string };
}

describe("foundation rebase", () => {
  it("previews without writing, then stores a clean rebase as a draft that is not activated", async () => {
    await k.publish("@alpha/demo", "2.0.0", V2_CLEAN);
    const from = await activeKit();
    const before = k.count("personal_kit_revisions") + k.count("personal_kit_audit");
    const preview = await k.call("preview-update", { updates: UPDATE });
    expect(preview.body.report).toMatchObject({ schema: "skillx.kit-rebase-report/v1", status: "clean", entries: [{ identity: "@alpha/demo", status: "clean", to: { version: "2.0.0" } }] });
    expect(k.count("personal_kit_revisions") + k.count("personal_kit_audit")).toBe(before);

    const res = await k.call("rebase", { expectedGeneration: 2, idempotencyKey: k.idem(), updates: UPDATE });
    expect(res.status).toBe(201);
    expect(res.body.revision).toMatchObject({ state: "draft", origin: "rebase", parentRevisionId: from.id });
    expect((await k.call("")).body.effectiveRevision.id).toBe(from.id);
    const doc = (await k.call(`revisions/${res.body.revision.id}`)).body.document;
    const composed = await k.treeOf("@alpha/demo", "2.0.0");
    expect(doc.skills[0].base).toEqual({ package: "@alpha/demo", version: "2.0.0", releaseDigest: composed.digest });
    expect(doc.skills[0].overlay.baseTreeDigest).toBe(composed.digest);
    const expected = await k.overlayTo("@alpha/demo", "2.0.0", { "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n").replace("eight\n", "eight (v2)\n")) });
    expect(doc.skills[0].compositionDigest).toBe(expected.compositionDigest);
  });

  it("records a same-hunk clash as an open conflict whose report holds no file content", async () => {
    const { conflictId } = await openConflict();
    const conflict = await k.call(`conflicts/${conflictId}`);
    expect(conflict.body).toMatchObject({ status: "open", report: { status: "needs-review", entries: [{ status: "needs-review", findings: [{ category: "conflict.same_hunk", path: "SKILL.md" }] }] } });
    const stored = JSON.stringify(k.h.d1.raw.prepare("SELECT report_json FROM personal_kit_conflicts").all());
    expect(JSON.stringify(conflict.body)).not.toMatch(/\(v2\)|\(mine\)/);
    expect(stored).not.toMatch(/two \(v2\)/);
    expect(k.count("personal_kit_revisions")).toBe(1);
  });

  it("resolves only on the user's decision, never applying the agent's suggestion", async () => {
    const { from, conflictId } = await openConflict();
    const path = `conflicts/${conflictId}/resolve`;
    const agent = await k.call(path, { expectedGeneration: 3, idempotencyKey: k.idem(), approvedBy: "agent", decisions: [{ identity: "@alpha/demo", choice: "keep-old" }] });
    expect(agent.body.error.code).toBe("kit.approval_required");
    const discard = await k.call(path, { expectedGeneration: 3, idempotencyKey: k.idem(), approvedBy: "user", decisions: [{ identity: "@alpha/demo", choice: "use-upstream" }] });
    expect(discard.body.error.code).toBe("kit.discard_unconfirmed");

    const merged = await k.overlayTo("@alpha/demo", "2.0.0", { "SKILL.md": skillText(BODY.replace("two\n", "two (mine, v2)\n")) });
    const body = {
      expectedGeneration: 3,
      idempotencyKey: "resolve-key-01",
      approvedBy: "user",
      decisions: [{ identity: "@alpha/demo", choice: "edit-overlay", ...merged }],
      agentSuggestion: { identity: "@alpha/demo", choice: "use-upstream", rationale: "upstream is newer" },
    };
    const res = await k.call(path, body);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ reevalRequired: true, revision: { origin: "resolution", state: "draft", parentRevisionId: from.id } });
    const closed = await k.call(`conflicts/${conflictId}`);
    expect(closed.body).toMatchObject({ status: "resolved", resolvedRevisionId: res.body.revision.id, resolution: { approvedBy: "user", agentSuggestionApplied: false, decisions: [{ choice: "edit-overlay" }] } });
    expect(closed.body.resolution.agentSuggestion.choice).toBe("use-upstream");
    const replay = await k.call(path, body);
    expect(replay.body).toMatchObject({ replayed: true, revision: { id: res.body.revision.id } });
    expect((await k.call(path, { ...body, idempotencyKey: k.idem() })).body.error.code).toBe("kit.conflict_closed");
  });

  it("closes a keep-old resolution onto the existing revision without a new one", async () => {
    const { from, conflictId } = await openConflict();
    const res = await k.call(`conflicts/${conflictId}/resolve`, { expectedGeneration: 3, idempotencyKey: k.idem(), approvedBy: "user", decisions: [{ identity: "@alpha/demo", choice: "keep-old" }] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reevalRequired: false, generation: 4, revision: { id: from.id } });
    expect(k.count("personal_kit_revisions")).toBe(1);
    expect((await k.call("")).body).toMatchObject({ openConflicts: 0, effectiveRevision: { id: from.id } });
  });

  it("forks the user's composition under a new alias while the entry follows upstream", async () => {
    const { conflictId } = await openConflict();
    const res = await k.call(`conflicts/${conflictId}/resolve`, {
      expectedGeneration: 3,
      idempotencyKey: k.idem(),
      approvedBy: "user",
      decisions: [{ identity: "@alpha/demo", choice: "fork", forkIdentity: "@alpha/demo-mine", alias: "demo-mine" }],
    });
    expect(res.status).toBe(201);
    const doc = (await k.call(`revisions/${res.body.revision.id}`)).body.document;
    expect(doc.skills.map((s: { identity: string; mode: string }) => [s.identity, s.mode])).toEqual([["@alpha/demo", "override"], ["@alpha/demo-mine", "fork"]]);
    expect(doc.skills[0].overlay.ops).toEqual([]);
    expect(doc.skills[1].base.version).toBe("1.0.0");
  });

  it("flags ambiguous providers and revoked bases; a quarantined pin cannot be activated or locked", async () => {
    await k.publish("@alpha/demo", "2.0.0", V2_CLEAN);
    const from = await activeKit();
    const twice = await k.call("preview-update", { updates: [...UPDATE, { package: "@alpha/demo", version: "1.0.0" }] });
    expect(twice.body.report.entries[0].findings[0].category).toBe("conflict.ambiguous_provider");

    k.sql("UPDATE package_releases SET release_state = 'quarantined' WHERE version = '1.0.0'");
    const preview = await k.call("preview-update", { updates: UPDATE });
    expect(preview.body.report.entries[0].findings[0].category).toBe("conflict.revoked_base");
    const lock = await k.call("lock");
    expect(lock.status).toBe(409);
    expect(lock.body.error.code).toBe("kit.locked_incompatible");
    expect(lock.body.error.reasons[0]).toMatch(/revoked_base/);
    const again = await k.call("rollback", { expectedGeneration: 2, revisionId: from.id, approval: { revisionDigest: from.digest } });
    expect(again.status).toBe(400);
  });
});
