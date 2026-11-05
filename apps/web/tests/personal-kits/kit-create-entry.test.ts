import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyOverlay, emptyKitTree, memoryTree, overlayBetween } from "@skillx/contracts";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

let k: KitHarness;
const NOTES = { "SKILL.md": skillText(BODY, "name: notes\ndescription: Keep notes"), "references/guide.md": "guide\n" };

beforeEach(async () => {
  session.user = null;
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", { "SKILL.md": skillText(BODY) });
});

async function created(identity: string, files: Record<string, string>, extra: Record<string, unknown> = {}) {
  const target = await memoryTree(Object.entries(files).map(([path, text]) => ({ path, text })));
  return { identity, mode: "create", base: null, overlay: await overlayBetween(emptyKitTree(), target), compositionDigest: target.digest, ...extra };
}

const store = async (skills: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}, generation = 0) =>
  k.call("revisions", { expectedGeneration: generation, idempotencyKey: k.idem(), document: k.doc(skills, extra) });

describe("personal kit create entries", () => {
  it("stores a created skill next to a based one and locks it with no base", async () => {
    const res = await store([await created("@alpha/notes", NOTES), await k.entry("@alpha/demo", "1.0.0")]);
    expect(res.status).toBe(201);
    expect(res.body.revision).toMatchObject({ state: "draft", origin: "manual" });
    const ok = await k.call("activate", { expectedGeneration: 1, revisionId: res.body.revision.id, approval: { revisionDigest: res.body.revision.digest } });
    expect(ok.status).toBe(200);
    const lock = await k.call("lock");
    const entry = lock.body.lock.entries.find((e: { identity: string }) => e.identity === "@alpha/notes");
    expect(entry).toMatchObject({ alias: "notes", mode: "create", package: null, version: null, releaseDigest: null });
    expect(entry.overlayDigests).toHaveLength(1);

    // The stored document carries the full files back byte for byte.
    const doc = lock.body.documents[0];
    const skill = doc.skills.find((s: { identity: string }) => s.identity === "@alpha/notes");
    expect(skill.base).toBeNull();
    const tree = await applyOverlay(emptyKitTree(), skill.overlay);
    expect(tree.digest).toBe(entry.compositionDigest);
    for (const [path, text] of Object.entries(NOTES)) expect(new TextDecoder().decode(await tree.read(path))).toBe(text);
  });

  it("refuses a compositionDigest the files do not give", async () => {
    const res = await store([await created("@alpha/notes", NOTES, { compositionDigest: `sha256:${"1".repeat(64)}` })]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("kit.composition_digest_mismatch");
    expect(k.count("personal_kit_revisions")).toBe(0);
  });

  it("scans every file of a created skill in full and refuses a secret", async () => {
    const leaked = { ...NOTES, "SKILL.md": skillText(BODY + "password=" + "hunter22\n", "name: notes\ndescription: Keep notes") };
    const res = await store([await created("@alpha/notes", leaked)]);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("kit.content_refused");
    expect(res.body.error.message).toContain("danger:secret-password:SKILL.md");
    expect(k.count("personal_kit_revisions")).toBe(0);
  });

  it("stores a created skill with a non-secret danger finding quarantined, never activatable", async () => {
    const risky = { ...NOTES, "references/guide.md": "[x](javascript:alert(1))\n" };
    const res = await store([await created("@alpha/notes", risky)]);
    expect(res.status).toBe(201);
    expect(res.body.revision.state).toBe("quarantined");
    const act = await k.call("activate", { expectedGeneration: 1, revisionId: res.body.revision.id, approval: { revisionDigest: res.body.revision.digest } });
    expect(act.status).toBe(409);
    expect(act.body.error.code).toBe("kit.revision_unusable");
    expect((await k.call("lock")).status).not.toBe(200);
  });

  it("refuses a created skill outside the kit handle", async () => {
    const res = await store([await created("@beta/notes", NOTES)]);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("kit.mode_violation");
  });
});
