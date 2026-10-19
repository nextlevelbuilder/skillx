import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseBaseSkill, runPersonalKitSmoke } from "../../../../scripts/smoke-personal-kits.mjs";
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
    name: "smoke-local",
    ...extra,
  });

describe("personal kit enablement smoke", () => {
  it("passes every check against an enabled API and leaves one private kit", async () => {
    const receipt = await run();
    expect(receipt.enabled).toBe(true);
    expect(receipt.checks.filter((c: { ok: boolean }) => !c.ok)).toEqual([]);
    expect(receipt.checks.map((c: { label: string }) => c.label)).toEqual([
      "unknown kit is 404 not_found",
      "anonymous is 401",
      "base release readable",
      "store revision is 201",
      "idempotent replay is 200",
      "stale If-Match is 412",
      "activate is 200 with a lock",
      "lock reads back",
      "other account is 404",
    ]);
    expect(receipt.ok).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain(k.ownerKey);
    expect(k.count("personal_kits")).toBe(1);
    expect(k.count("personal_kit_revisions")).toBe(1);
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
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(parseBaseSkill("@alpha/demo@1.0.0-beta.1")).toEqual({ pkg: "@alpha/demo", version: "1.0.0-beta.1" });
  });
});
