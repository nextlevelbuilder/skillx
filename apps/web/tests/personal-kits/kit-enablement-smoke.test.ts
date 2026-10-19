import { beforeEach, describe, expect, it, vi } from "vitest";
import { main, parseBaseSkill, runPersonalKitSmoke } from "../../../../scripts/smoke-personal-kits.mjs";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

vi.mock("~/lib/auth/session-helpers", () => ({ getSession: async () => null }));

/**
 * The enablement smoke run against the real kit and release route modules
 * over the in-memory D1/R2: the local receipt that the smoke itself works.
 * It says nothing about a deployed SkillX.
 */
let k: KitHarness;

beforeEach(async () => {
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", { "SKILL.md": skillText(BODY) });
});

const run = (extra: Record<string, unknown> = {}) =>
  runPersonalKitSmoke({
    fetchImpl: k.serve,
    base: "https://skillx.test",
    ownerKey: k.ownerKey,
    otherKey: k.otherKey,
    handle: "alpha",
    baseSkill: "@alpha/demo@1.0.0",
    ...extra,
  });

const failed = (receipt: { checks: Array<{ ok: boolean }> }) => receipt.checks.filter((c) => !c.ok);

describe("personal kit enablement smoke", () => {
  it("passes every check against an enabled API and leaves one private kit", async () => {
    const receipt = await run();
    expect(receipt.enabled).toBe(true);
    expect(receipt.kit).toBe("@alpha/agentkit-smoke");
    expect(failed(receipt)).toEqual([]);
    expect(receipt.checks.map((c: { label: string }) => c.label)).toEqual([
      "unknown kit is 404 not_found",
      "anonymous is 401",
      "base release readable",
      "smoke kit generation readable",
      "store revision is 201",
      "idempotent replay is 200",
      "stale If-Match is 412",
      "activate is 200 with a lock",
      "lock reads back",
      "other account read is 404",
      "other account write is 404",
      "other account activate is 404",
      "other account cannot create under the handle",
      "owner kit unchanged by the other account",
    ]);
    expect(receipt.ok).toBe(true);
    expect(receipt.crossAccount).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain(k.ownerKey);
    expect(JSON.stringify(receipt)).not.toContain(k.otherKey);
    // The foreign writes stored nothing: one kit, one revision, all the owner's.
    expect(k.count("personal_kits")).toBe(1);
    expect(k.count("personal_kit_revisions")).toBe(1);
  });

  it("reuses the one smoke kit on a later run instead of creating another", async () => {
    expect((await run()).ok).toBe(true);
    const second = await run();
    expect(failed(second)).toEqual([]);
    expect(k.count("personal_kits")).toBe(1);
    expect(k.count("personal_kit_revisions")).toBe(2);
  });

  it("treats a redirect as a failed check and never follows it", async () => {
    const seen: Array<RequestInit | undefined> = [];
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
      seen.push(init);
      return new Response(null, { status: 302, headers: { Location: "https://elsewhere.test/" } });
    };
    const receipt = await run({ fetchImpl });
    expect(receipt.ok).toBe(false);
    expect(receipt.checks).toEqual([{ label: "unknown kit is 404 not_found", ok: false, status: 302, code: "redirect" }]);
    expect(seen.every((init) => init?.redirect === "manual")).toBe(true);
  });

  it("refuses a remote run without a second account key, before any request", async () => {
    const fetchImpl = vi.fn();
    const errors: string[] = [];
    const io = { fetchImpl, log: () => {}, error: (m: string) => errors.push(m) };
    const args = ["--base", "https://staging.skillx.test", "--handle", "alpha", "--base-skill", "@alpha/demo@1.0.0"];
    expect(await main(args, { SKILLX_SMOKE_OWNER_KEY: "k" }, io)).toBe(1);
    expect(await main([...args, "--allow-remote"], { SKILLX_SMOKE_OWNER_KEY: "k" }, io)).toBe(1);
    expect(errors.join("\n")).toMatch(/SKILLX_SMOKE_OTHER_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a remote run over plain http even with both keys, before any request", async () => {
    const fetchImpl = vi.fn();
    const errors: string[] = [];
    const io = { fetchImpl, log: () => {}, error: (m: string) => errors.push(m) };
    const args = ["--base", "http://staging.skillx.test", "--allow-remote", "--handle", "alpha", "--base-skill", "@alpha/demo@1.0.0"];
    expect(await main(args, { SKILLX_SMOKE_OWNER_KEY: "k", SKILLX_SMOKE_OTHER_KEY: "o" }, io)).toBe(1);
    expect(errors.join("\n")).toMatch(/must be https/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a flag-off deployment as disabled and writes nothing", async () => {
    const receipt = await run({ fetchImpl: k.serveWith({ SKILLX_PERSONAL_KITS_API: "0" }) });
    expect(receipt).toMatchObject({ enabled: false, ok: false, checks: [{ label: "api enabled", ok: false, status: 404, code: "kit.api_disabled" }] });
    expect(k.count("personal_kits")).toBe(0);
  });

  it("refuses bad input before any request", async () => {
    const fetchImpl = vi.fn();
    await expect(run({ fetchImpl, ownerKey: "" })).rejects.toThrow(/owner API key/);
    await expect(run({ fetchImpl, handle: "Alpha" })).rejects.toThrow(/--handle/);
    await expect(run({ fetchImpl, baseSkill: "@alpha/demo" })).rejects.toThrow(/--base-skill/);
    await expect(run({ fetchImpl, name: "Smoke_Kit" })).rejects.toThrow(/--kit-name/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(parseBaseSkill("@alpha/demo@1.0.0-beta.1")).toEqual({ pkg: "@alpha/demo", version: "1.0.0-beta.1" });
  });
});
