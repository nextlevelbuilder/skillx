import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lockDigest } from "@skillx/contracts";
import { installRefs, listInstalled, uninstallRef } from "../../../../packages/cli/src/lib/install/install-operations";
import { readLockFile, writeLockFile } from "../../../../packages/cli/src/lib/install/lock-file";
import { readReceipt, scanDir } from "../../../../packages/cli/src/lib/install/install-state";
import { syncLocked } from "../../../../packages/cli/src/lib/install/sync-locked";
import { BODY, skillText } from "../personal-kits/kit-harness";
import { createInstallServer } from "./install-server";

// Each test installs signed releases on several temp machines; under a full parallel run that can pass 5s.
vi.setConfig({ testTimeout: 30_000 });

type Server = Awaited<ReturnType<typeof createInstallServer>>;
let s: Server;

const DEMO = { "SKILL.md": skillText(BODY), "references/guide.md": "guide v1\n" };
const TOOLS = { "SKILL.md": skillText("# Tools\n", "name: tools\ndescription: Tools"), "scripts/run.sh": "echo run\n" };

beforeEach(async () => {
  s = await createInstallServer();
  await s.k.publish("@alpha/demo", "1.0.0", DEMO);
  await s.k.publish("@alpha/tools", "1.0.0", TOOLS);
});
afterEach(() => s.cleanup());

/** Stores and activates a kit revision: demo with a personal overlay, tools as published. */
async function activeKit() {
  const mine = { ...DEMO, "SKILL.md": skillText(BODY.replace("three", "THREE (mine)")) };
  const document = s.k.doc([await s.k.entry("@alpha/demo", "1.0.0", mine), await s.k.entry("@alpha/tools", "1.0.0")]);
  const rev = (await s.k.call("revisions", { expectedGeneration: 0, idempotencyKey: s.k.idem(), document })).body.revision;
  const act = await s.k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } });
  expect(act.status).toBe(200);
  return { rev, mine };
}

const tree = (dir: string) => scanDir(dir).map((f) => `${f.path} ${f.sha256}`);

describe("installer end to end", () => {
  it("installs a kit revision on machine A and restores identical digests on machine B from the lock", async () => {
    const { rev, mine } = await activeKit();
    const a = s.machine("a");
    const ctxA = a.context();
    const outcome = await installRefs(ctxA, ["kit:@alpha/my-kit"]);
    expect(outcome.lock.source).toMatchObject({ kind: "kit", kit: "@alpha/my-kit", revisionId: rev.id, revisionDigest: rev.digest });
    expect(outcome.lock.packages.map((p) => [p.alias, p.overlayDigests.length])).toEqual([["demo", 1], ["tools", 0]]);
    const demoA = join(ctxA.skillsDir, "demo");
    expect(ctxA.skillsDir).toBe(join(a.root, ".claude", "skills"));
    expect(readFileSync(join(demoA, "SKILL.md"), "utf8")).toBe(mine["SKILL.md"]);

    const lockPath = writeLockFile(join(a.root, "skillx.lock.json"), outcome.lock);
    expect(readFileSync(lockPath, "utf8")).not.toContain(a.root);

    const b = s.machine("b");
    const ctxB = b.context();
    const restored = await syncLocked(ctxB, readLockFile(lockPath));
    expect(restored.lockDigest).toBe(await lockDigest(outcome.lock));
    for (const alias of ["demo", "tools"]) {
      expect(tree(join(ctxB.skillsDir, alias))).toEqual(tree(join(ctxA.skillsDir, alias)));
      expect(readReceipt(ctxB.home, "claude-code", alias)!.compositionDigest).toBe(readReceipt(ctxA.home, "claude-code", alias)!.compositionDigest);
    }
    // Rerunning a sync on a converged machine changes nothing.
    const again = await syncLocked(ctxB, readLockFile(lockPath));
    expect(again.items[0]!.plan.actions.map((x) => x.action)).toEqual(["unchanged", "unchanged"]);

    // A third machine restores the kit revision straight from the server, into Codex.
    const c = s.machine("c");
    const ctxC = c.context({ runtime: "codex" });
    await installRefs(ctxC, [`kit:@alpha/my-kit#${rev.id}`]);
    expect(ctxC.skillsDir).toBe(join(c.root, ".codex", "skills"));
    expect(tree(join(ctxC.skillsDir, "demo"))).toEqual(tree(demoA));
  });

  it("refuses drift: an edited lock, and local edits unless forced (which backs them up)", async () => {
    await activeKit();
    const a = s.machine("a");
    const ctx = a.context();
    const { lock } = await installRefs(ctx, ["kit:@alpha/my-kit"]);
    const tampered = { ...lock, packages: lock.packages.map((p) => (p.alias === "tools" ? { ...p, alias: "tools2" } : p)) };
    await expect(syncLocked(ctx, tampered)).rejects.toMatchObject({ code: "conflict" });

    const skill = join(ctx.skillsDir, "tools", "SKILL.md");
    writeFileSync(skill, "my local edit\n");
    await expect(syncLocked(ctx, lock)).rejects.toMatchObject({ code: "conflict", details: { conflicts: [expect.objectContaining({ alias: "tools", reason: "local_modified" })] } });
    expect(readFileSync(skill, "utf8")).toBe("my local edit\n");

    const forced = await syncLocked(a.context({ force: true }), lock);
    const backupDir = forced.applied[0]!.changed.find((c) => c.alias === "tools")!.backupDir!;
    expect(readFileSync(join(backupDir, "SKILL.md"), "utf8")).toBe("my local edit\n");
    expect(readFileSync(skill, "utf8")).toBe(TOOLS["SKILL.md"]);
  });

  it("verifies before writing: a tampered file or an untrusted signing key installs nothing", async () => {
    const a = s.machine("a");
    s.setRewrite(async (path, res) => (path.endsWith("/files/scripts/run.sh") ? new Response("echo pwned\n", { status: 200 }) : res));
    await expect(installRefs(a.context(), ["@alpha/tools"])).rejects.toMatchObject({ code: "integrity_error" });
    s.setRewrite(null);
    await expect(installRefs(a.context({ keys: new Map() }), ["@alpha/tools"])).rejects.toMatchObject({ code: "integrity_error" });
    expect(existsSync(join(a.context().skillsDir, "tools"))).toBe(false);
    expect(listInstalled(a.context()).skills).toEqual([]);
  });

  it("installs a collection revision, pinned and latest members, into Codex", async () => {
    await s.k.publish("@alpha/tools", "1.1.0", { ...TOOLS, "scripts/run.sh": "echo run 1.1\n" });
    const created = await s.serverFetch("https://skillx.test/api/v1/collections", {
      method: "POST",
      headers: { Authorization: `Bearer ${s.k.ownerKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "starter", members: [{ packageName: "@alpha/demo", version: "1.0.0" }, { packageName: "@alpha/tools" }] }),
    });
    const { collection } = (await created.json()) as { collection: { id: string } };
    const c = s.machine("c");
    const ctx = c.context({ runtime: "codex" });
    const outcome = await installRefs(ctx, [`collection:${collection.id}`]);
    expect(outcome.lock.source).toMatchObject({ kind: "collection", collectionId: collection.id, revisionNumber: 1 });
    expect(outcome.lock.packages.map((p) => `${p.package}@${p.version}`)).toEqual(["@alpha/demo@1.0.0", "@alpha/tools@1.1.0"]);
    expect(readFileSync(join(c.root, ".codex", "skills", "tools", "scripts", "run.sh"), "utf8")).toBe("echo run 1.1\n");
  });

  it("ref-counts shared skills and uninstalls with ownership proof, keeping edited and unknown files", async () => {
    await activeKit();
    const a = s.machine("a");
    const ctx = a.context();
    await installRefs(ctx, ["kit:@alpha/my-kit"]);
    await installRefs(ctx, ["@alpha/tools@1.0.0"]);
    expect(readReceipt(ctx.home, "claude-code", "tools")!.requiredBy).toEqual(["kit:@alpha/my-kit", "packages:@alpha/tools"]);

    const kitGone = await uninstallRef(ctx, ["kit:@alpha/my-kit"]);
    expect(kitGone.removed.map((r) => r.alias)).toEqual(["demo"]);
    expect(existsSync(join(ctx.skillsDir, "demo"))).toBe(false);
    expect(readReceipt(ctx.home, "claude-code", "tools")!.requiredBy).toEqual(["packages:@alpha/tools"]);

    const tools = join(ctx.skillsDir, "tools");
    writeFileSync(join(tools, "SKILL.md"), "edited\n");
    writeFileSync(join(tools, "notes.txt"), "mine\n");
    const gone = await uninstallRef(ctx, ["@alpha/tools"]);
    expect(gone.removed[0]).toMatchObject({ alias: "tools", removed: ["scripts/run.sh"], keptModified: ["SKILL.md"], keptUnknown: ["notes.txt"] });
    expect(scanDir(tools).map((f) => f.path)).toEqual(["SKILL.md", "notes.txt"]);
    expect(readReceipt(ctx.home, "claude-code", "tools")).toBeNull();
    await expect(uninstallRef(ctx, ["@alpha/tools"])).rejects.toMatchObject({ code: "not_found" });
  });
});
