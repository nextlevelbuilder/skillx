import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrashPoint } from "../../../../packages/cli/src/lib/install/apply-transaction";
import { withInstallLock } from "../../../../packages/cli/src/lib/install/install-context";
import { installRefs } from "../../../../packages/cli/src/lib/install/install-operations";
import { readReceipt, scanDir, writeReceipt } from "../../../../packages/cli/src/lib/install/install-state";
import { handleMessage } from "../../../../packages/cli/src/lib/install/local-mcp";
import { skillText } from "../personal-kits/kit-harness";
import { createInstallServer } from "./install-server";

// Each test installs signed releases on several temp machines; under a full parallel run that can pass 5s.
vi.setConfig({ testTimeout: 30_000 });

type Server = Awaited<ReturnType<typeof createInstallServer>>;
let s: Server;

const V1 = { "SKILL.md": skillText("# Demo v1\n"), "old-only.md": "v1 file\n" };
const V2 = { "SKILL.md": skillText("# Demo v2\n"), "new-only.md": "v2 file\n" };

beforeEach(async () => {
  s = await createInstallServer();
  await s.k.publish("@alpha/demo", "1.0.0", V1);
  await s.k.publish("@alpha/demo", "2.0.0", V2);
});
afterEach(() => s.cleanup());

const paths = (dir: string) => scanDir(dir).map((f) => f.path);
const at = (point: CrashPoint, run: (dir: string) => void) => (p: CrashPoint, alias: string) => {
  if (p === point) run(alias);
};

describe("files changed between plan and swap", () => {
  it("refuses the swap when a file appears or changes after planning", async () => {
    const m = s.machine("drift");
    const ctx = m.context();
    await installRefs(ctx, ["@alpha/demo@1.0.0"]);
    const dir = join(ctx.skillsDir, "demo");

    for (const edit of [() => writeFileSync(join(dir, "notes.md"), "mine\n"), () => writeFileSync(join(dir, "old-only.md"), "edited\n")]) {
      const racing = m.context({ hooks: { at: at("staged", edit) } });
      await expect(installRefs(racing, ["@alpha/demo@2.0.0"])).rejects.toMatchObject({
        code: "conflict",
        details: { conflicts: [expect.objectContaining({ alias: "demo", reason: "local_modified" })] },
      });
      expect(readReceipt(ctx.home, "claude-code", "demo")!.version).toBe("1.0.0");
      expect(readdirSync(ctx.stagingDir)).toEqual([]);
    }
    expect(paths(dir)).toEqual(["SKILL.md", "notes.md", "old-only.md"]);
    expect(readFileSync(join(dir, "notes.md"), "utf8")).toBe("mine\n");
  });

  it("saves a file created after the final check to the backups instead of deleting it", async () => {
    const m = s.machine("late");
    const ctx = m.context();
    await installRefs(ctx, ["@alpha/demo@1.0.0"]);
    const late = m.context({ hooks: { at: at("journaled", () => writeFileSync(join(ctx.skillsDir, "demo", "late.md"), "late\n")) } });
    const outcome = await installRefs(late, ["@alpha/demo@2.0.0"]);
    const change = outcome.applied[0]!.changed[0]!;
    expect(change.displaced).toEqual(["late.md"]);
    expect(change.backupDir).toContain(join(ctx.home, "backups"));
    expect(readFileSync(join(change.backupDir!, "late.md"), "utf8")).toBe("late\n");
    expect(paths(join(ctx.skillsDir, "demo"))).toEqual(["SKILL.md", "new-only.md"]);
  });
});

describe("a skill directory held open by another program", () => {
  const busy = () => Object.assign(new Error("resource busy"), { code: "EBUSY" });

  it("retries a busy rename and completes", async () => {
    const m = s.machine("busy-once");
    await installRefs(m.context(), ["@alpha/demo@1.0.0"]);
    let failures = 2;
    const ctx = m.context({ hooks: { rename: (from, to) => { if (failures-- > 0) throw busy(); renameSync(from, to); } } });
    await installRefs(ctx, ["@alpha/demo@2.0.0"]);
    expect(paths(join(ctx.skillsDir, "demo"))).toEqual(["SKILL.md", "new-only.md"]);
  });

  it("gives up with a conflict and leaves the old tree whole", async () => {
    const m = s.machine("busy-always");
    await installRefs(m.context(), ["@alpha/demo@1.0.0"]);
    const ctx = m.context({ hooks: { rename: () => { throw busy(); } } });
    await expect(installRefs(ctx, ["@alpha/demo@2.0.0"])).rejects.toMatchObject({ code: "conflict" });
    const plain = m.context();
    expect(paths(join(plain.skillsDir, "demo"))).toEqual(["SKILL.md", "old-only.md"]);
    expect(readReceipt(plain.home, "claude-code", "demo")!.version).toBe("1.0.0");
    expect(existsSync(join(plain.home, "journal", "claude-code", "demo.json"))).toBe(false);
    expect(readdirSync(plain.stagingDir)).toEqual([]);
  });
});

describe("state left by a crashed run", () => {
  it("drops owners that no longer exist and removes a skill nobody owns", async () => {
    const m = s.machine("orphans");
    const ctx = m.context();
    await installRefs(ctx, ["@alpha/demo@1.0.0"]);
    const receipt = readReceipt(ctx.home, "claude-code", "demo")!;
    writeReceipt(ctx.home, { ...receipt, alias: "ghost", requiredBy: ["kit:@alpha/gone"] });
    mkdirSync(join(ctx.skillsDir, "ghost"));
    for (const f of receipt.files) writeFileSync(join(ctx.skillsDir, "ghost", f.path), readFileSync(join(ctx.skillsDir, "demo", f.path)));
    writeReceipt(ctx.home, { ...receipt, requiredBy: [...receipt.requiredBy, "kit:@alpha/gone"] });

    await installRefs(ctx, ["@alpha/demo@1.0.0"]);
    expect(readReceipt(ctx.home, "claude-code", "demo")!.requiredBy).toEqual(["packages:@alpha/demo"]);
    expect(readReceipt(ctx.home, "claude-code", "ghost")).toBeNull();
    expect(existsSync(join(ctx.skillsDir, "ghost"))).toBe(false);
  });

  it("takes over a lock whose process is gone and refuses a live or unreadable one", async () => {
    const ctx = s.machine("lock").context();
    const lockPath = join(ctx.home, "install.lock");
    mkdirSync(ctx.home, { recursive: true });
    writeFileSync(lockPath, "2147483646");
    await expect(withInstallLock(ctx, async () => "ran")).resolves.toBe("ran");
    expect(existsSync(lockPath)).toBe(false);

    for (const holder of [String(process.pid), "garbage"]) {
      writeFileSync(lockPath, holder);
      await expect(withInstallLock(ctx, async () => "ran")).rejects.toMatchObject({ code: "conflict" });
      expect(readFileSync(lockPath, "utf8")).toBe(holder);
    }
  });
});

describe("compatibility is checked before content is fetched", () => {
  it("refuses a malformed skillx.json without downloading the skill", async () => {
    await s.k.publish("@alpha/broken", "1.0.0", { "SKILL.md": skillText("# Broken\n"), "skillx.json": "{ not json" });
    s.requests.length = 0;
    await expect(installRefs(s.machine("broken").context(), ["@alpha/broken@1.0.0"])).rejects.toMatchObject({ code: "incompatible" });
    expect(s.requests.some((r) => r.endsWith("/files/SKILL.md"))).toBe(false);
  });
});

describe("local MCP apply", () => {
  const call = (m: ReturnType<Server["machine"]>, args: Record<string, unknown>) =>
    handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "apply", arguments: args } }, (a) => m.context(a), "test") as Promise<{
      result: { isError: boolean; structuredContent: Record<string, any> };
    }>;

  it("needs the digest of a plan the caller saw and never forces", async () => {
    const m = s.machine("mcp-apply");
    for (const args of [{ confirm: true }, { confirm: true, planDigest: "sha256:x", force: true }]) {
      const refused = await call(m, { source: "@alpha/demo@1.0.0", ...args });
      expect(refused.result.structuredContent.error.code).toBe("usage_error");
    }
    expect(existsSync(join(m.context().skillsDir, "demo"))).toBe(false);
  });
});
