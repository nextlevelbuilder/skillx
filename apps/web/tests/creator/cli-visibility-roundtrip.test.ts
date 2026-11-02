import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { releasePublishScope } from "~/lib/auth/api-key-scopes";
import { servePackageAction } from "~/lib/creator/owner-actions-http";
import { loader as listLoader } from "~/routes/api.v1.package-releases";
import { runVisibilityGet, runVisibilitySet } from "../../../../packages/cli/src/commands/visibility";
import { envOf, publish, useStateHarness } from "../releases/release-state-helpers";
import type { Harness } from "../releases/release-state-helpers";
import { ORIGIN, packageAudit, visibilityOf } from "./creator-helpers";

/**
 * `skillx visibility get|set` against the real registry handlers: the CLI's
 * fetch is routed in-process to the release list loader and the owner
 * visibility action, so the request shape, the compare-and-set and the
 * refusals are the registry's own. `user-a` owns `@alpha`.
 */
vi.mock("~/lib/auth/session-helpers", () => ({ getSession: async () => null }));

let h: Harness;
const REG = { registry: ORIGIN };

/** Routes the CLI's `fetch` to the registry handlers under test. */
function routeFetchToRegistry() {
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const match = /^\/api\/v1\/packages\/(@[^/]+)\/([^/]+)\/(releases|visibility)$/.exec(path);
    if (match === null) return new Response("not routed", { status: 599 });
    const params = { scope: match[1]!, slug: match[2]! };
    if (match[3] === "releases") return listLoader({ request, params, context: { cloudflare: { env: envOf() } } } as never);
    return servePackageAction(request, envOf() as never, params, "visibility");
  });
}

beforeEach(async () => {
  h = await useStateHarness();
  await publish();
  routeFetchToRegistry();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("skillx visibility against the registry", () => {
  it("narrows public -> unlisted -> private with the owner's account key, audited, and reads it back", async () => {
    vi.stubEnv("SKILLX_API_KEY", await h.createKey("user-a", null));
    expect(await runVisibilityGet("@alpha/demo", REG)).toEqual({ identity: "@alpha/demo", visibility: "public" });
    expect(await runVisibilitySet("@alpha/demo", "unlisted", REG)).toMatchObject({ from: "public", to: "unlisted", visibility: "unlisted", changed: true });
    expect(await runVisibilitySet("@alpha/demo", "private", REG)).toMatchObject({ from: "unlisted", to: "private", visibility: "private", changed: true });
    // The owner still reads the now-private package.
    expect(await runVisibilityGet("@alpha/demo", REG)).toEqual({ identity: "@alpha/demo", visibility: "private" });
    expect(await runVisibilitySet("@alpha/demo", "private", REG)).toMatchObject({ changed: false });
    expect(visibilityOf(h, "@alpha/demo").visibility).toBe("private");
    expect(packageAudit(h).map((row) => [row.from_value, row.to_value])).toEqual([
      ["public", "unlisted"],
      ["unlisted", "private"],
    ]);
  });

  it("refuses widening with a key and names the dashboard; nothing is written", async () => {
    vi.stubEnv("SKILLX_API_KEY", await h.createKey("user-a", null));
    await runVisibilitySet("@alpha/demo", "private", REG);
    await expect(runVisibilitySet("@alpha/demo", "public", REG)).rejects.toMatchObject({
      code: "auth_error",
      extra: { details: { status: 403, code: "visibility.approval_required" }, hint: expect.stringContaining(`${ORIGIN}/dashboard`) },
    });
    expect(visibilityOf(h, "@alpha/demo").visibility).toBe("private");
    expect(packageAudit(h)).toHaveLength(1);
  });

  it("refuses a stale --from, a publish key, and a key of another account", async () => {
    vi.stubEnv("SKILLX_API_KEY", await h.createKey("user-a", null));
    await expect(runVisibilitySet("@alpha/demo", "private", { ...REG, from: "unlisted" })).rejects.toMatchObject({
      code: "api_error",
      extra: { details: { code: "visibility_conflict" }, hint: expect.stringContaining("skillx visibility get @alpha/demo") },
    });
    vi.stubEnv("SKILLX_API_KEY", await h.createKey("user-a", [releasePublishScope("alpha")]));
    await expect(runVisibilitySet("@alpha/demo", "private", { ...REG, from: "public" })).rejects.toMatchObject({
      code: "auth_error",
      extra: { hint: expect.stringContaining("unscoped account API key") },
    });
    vi.stubEnv("SKILLX_API_KEY", await h.createKey("user-b", null));
    await expect(runVisibilitySet("@alpha/demo", "private", { ...REG, from: "public" })).rejects.toMatchObject({ code: "not_found" });
    expect(visibilityOf(h, "@alpha/demo").visibility).toBe("public");
    expect(packageAudit(h)).toEqual([]);
  });
});
