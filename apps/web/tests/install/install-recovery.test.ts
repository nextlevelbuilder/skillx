import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CrashPoint } from "../../../../packages/cli/src/lib/install/apply-transaction";
import { installRefs } from "../../../../packages/cli/src/lib/install/install-operations";
import { readReceipt, scanDir } from "../../../../packages/cli/src/lib/install/install-state";
import { handleMessage } from "../../../../packages/cli/src/lib/install/local-mcp";
import { skillText } from "../personal-kits/kit-harness";
import { createInstallServer } from "./install-server";

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

const POINTS: CrashPoint[] = ["staged", "journaled", "moved-old", "swapped", "receipt-written"];
const paths = (dir: string) => scanDir(dir).map((f) => f.path);

class Crash extends Error {}

describe("interrupted installs converge on rerun", () => {
  it.each(POINTS)("update killed at %s, then rerun", async (point) => {
    const m = s.machine("crash");
    await installRefs(m.context(), ["@alpha/demo@1.0.0"]);
    const crashing = m.context({
      hooks: {
        at: (p) => {
          if (p === point) throw new Crash(p);
        },
      },
    });
    await expect(installRefs(crashing, ["@alpha/demo@2.0.0"])).rejects.toBeInstanceOf(Crash);

    // Whatever the crash point, the skill directory never holds a mix of versions;
    // between the two renames it is briefly absent until the next run recovers it.
    const ctx = m.context();
    const dir = join(ctx.skillsDir, "demo");
    const whole = [["SKILL.md", "old-only.md"], ["SKILL.md", "new-only.md"], ...(point === "moved-old" ? [[]] : [])];
    expect(whole).toContainEqual(paths(dir));

    const rerun = await installRefs(ctx, ["@alpha/demo@2.0.0"]);
    const recovered = [...rerun.recovered.rolledBack, ...rerun.recovered.rolledForward];
    expect(recovered).toEqual(point === "staged" ? [] : ["demo"]);
    expect(paths(dir)).toEqual(["SKILL.md", "new-only.md"]);
    expect(readReceipt(ctx.home, "claude-code", "demo")).toMatchObject({ version: "2.0.0", requiredBy: ["packages:@alpha/demo"] });
    expect(readdirSync(ctx.stagingDir)).toEqual([]);
    expect(existsSync(join(ctx.home, "journal", "claude-code", "demo.json"))).toBe(false);
  });

  it.each(POINTS)("first install killed at %s, then rerun", async (point) => {
    const m = s.machine("fresh");
    const crashing = m.context({ hooks: { at: (p) => { if (p === point) throw new Crash(p); } } });
    await expect(installRefs(crashing, ["@alpha/demo@1.0.0"])).rejects.toBeInstanceOf(Crash);
    const ctx = m.context();
    await installRefs(ctx, ["@alpha/demo@1.0.0"]);
    expect(paths(join(ctx.skillsDir, "demo"))).toEqual(["SKILL.md", "old-only.md"]);
    expect(readReceipt(ctx.home, "claude-code", "demo")!.version).toBe("1.0.0");
    expect(readdirSync(ctx.stagingDir)).toEqual([]);
  });
});

describe("local MCP", () => {
  const call = (m: ReturnType<Server["machine"]>, name: string, args: Record<string, unknown>) =>
    handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, (a) => m.context(a), "test") as Promise<{ result: { isError: boolean; structuredContent: Record<string, any> } }>;

  it("lists three tools and requires confirm: true to apply", async () => {
    const m = s.machine("mcp");
    const list = (await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, () => m.context(), "test")) as { result: { tools: Array<{ name: string }> } };
    expect(list.result.tools.map((t) => t.name)).toEqual(["inspect", "plan", "apply"]);

    const refused = await call(m, "apply", { source: "@alpha/demo@1.0.0" });
    expect(refused.result.isError).toBe(true);
    expect(refused.result.structuredContent.error.code).toBe("usage_error");
    expect(existsSync(join(m.context().skillsDir, "demo"))).toBe(false);

    const plan = await call(m, "plan", { source: "@alpha/demo@1.0.0", runtime: "codex" });
    expect(plan.result.structuredContent.items[0].plan.actions[0]).toMatchObject({ action: "install", alias: "demo" });
    const digest = plan.result.structuredContent.planDigest as string;

    const stale = await call(m, "apply", { source: "@alpha/demo@2.0.0", runtime: "codex", confirm: true, planDigest: digest });
    expect(stale.result.structuredContent.error.code).toBe("conflict");

    const applied = await call(m, "apply", { source: "@alpha/demo@1.0.0", runtime: "codex", confirm: true, planDigest: digest });
    expect(applied.result.isError).toBe(false);
    expect(existsSync(join(m.root, ".codex", "skills", "demo", "SKILL.md"))).toBe(true);

    const inspect = await call(m, "inspect", { runtime: "codex" });
    expect(inspect.result.structuredContent.installed.skills).toEqual([expect.objectContaining({ alias: "demo", version: "1.0.0" })]);
  });
});
