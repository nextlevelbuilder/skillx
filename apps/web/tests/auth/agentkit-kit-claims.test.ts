import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseKitsClaim, resetJwksCache, verifyAccessToken } from "~/lib/agentkit/access-token";
import { completeLink, startLink } from "~/lib/agentkit/link-flow";
import { ensureLinkLive, refreshViewerLink } from "~/lib/agentkit/link-liveness";
import { linkOfUser } from "~/lib/agentkit/link-store";
import { hashApiKey } from "~/lib/auth/api-key-utils";
import { resolveRequestCredential } from "~/lib/auth/scoped-viewer";
import { createFakeAs, createIdentityEnv } from "./agentkit-fake-as";

/**
 * The `agentkit_kits` claim: the paid AgentKit kits the account owns, as the
 * AS states them at every issuance. SkillX keeps the claim of its own grant's
 * newest token on the link (link, then every refresh), replacing the stored
 * kits each time, and fails closed on anything but a list of kit names.
 */

let as: Awaited<ReturnType<typeof createFakeAs>>;
let ctx: ReturnType<typeof createIdentityEnv>;

beforeEach(async () => {
  resetJwksCache();
  as = await createFakeAs();
  ctx = createIdentityEnv();
});

async function linkAs(userId: string) {
  const authorize = new URL((await startLink(ctx.env, userId))!);
  const code = `code-${userId}-${Math.random()}`;
  as.state.codes.set(code, authorize.searchParams.get("code_challenge")!);
  return completeLink(ctx.env, userId, new URLSearchParams({ code, state: authorize.searchParams.get("state")! }), as.fetcher);
}

const storedKits = () => (ctx.d1.raw.prepare("SELECT kits FROM agentkit_links WHERE user_id = 'user-a'").get() as { kits: string }).kits;
const stale = async () => {
  ctx.d1.raw.prepare("UPDATE agentkit_links SET validated_at = ?").run(Date.now() - 61_000);
  return (await linkOfUser(ctx.env.DB, "user-a"))!;
};

describe("agentkit_kits claim", () => {
  it("keeps kit names only, sorted and unique, and grants nothing for any other shape", () => {
    expect(parseKitsClaim(["marketing", "engineer", "engineer"])).toEqual(["engineer", "marketing"]);
    expect(parseKitsClaim(["engineer", "Engineer", "", "a b", "../x", 7, null, "-x", "x".repeat(65)])).toEqual(["engineer"]);
    for (const value of [undefined, null, "engineer", { engineer: true }, 1]) expect(parseKitsClaim(value)).toEqual([]);
  });

  it("is read from a verified token, and absent means no kit", async () => {
    as.state.kits = ["engineer"];
    expect((await verifyAccessToken(ctx.env, await as.sign(), as.fetcher)).kits).toEqual(["engineer"]);
    as.state.kits = undefined;
    expect((await verifyAccessToken(ctx.env, await as.sign(), as.fetcher)).kits).toEqual([]);
  });
});

describe("kits on the link", () => {
  it("stores the kits of the token the link was made with", async () => {
    as.state.kits = ["marketing", "engineer"];
    expect(await linkAs("user-a")).toBe("linked");
    expect(storedKits()).toBe('["engineer","marketing"]');
    expect((await linkOfUser(ctx.env.DB, "user-a"))!.kits).toEqual(["engineer", "marketing"]);
  });

  it("replaces the kits at every refresh, so a refunded kit is gone at the next one", async () => {
    as.state.kits = ["engineer"];
    await linkAs("user-a");
    as.state.kits = ["engineer", "marketing"];
    expect(await ensureLinkLive(ctx.env, await stale(), as.fetcher)).toBe("live");
    expect(storedKits()).toBe('["engineer","marketing"]');
    as.state.kits = [];
    expect(await ensureLinkLive(ctx.env, await stale(), as.fetcher)).toBe("live");
    expect(storedKits()).toBe("[]");
  });

  it("clears the kits when the AS stops sending the claim", async () => {
    as.state.kits = ["engineer"];
    await linkAs("user-a");
    as.state.kits = undefined;
    await ensureLinkLive(ctx.env, await stale(), as.fetcher);
    expect(storedKits()).toBe("[]");
  });

  it("keeps the stored kits while a fresh link needs no refresh", async () => {
    as.state.kits = ["engineer"];
    await linkAs("user-a");
    as.state.kits = [];
    expect(await ensureLinkLive(ctx.env, (await linkOfUser(ctx.env.DB, "user-a"))!, as.fetcher)).toBe("live");
    expect(storedKits()).toBe('["engineer"]');
  });
});

describe("kits of a viewer that is not an AgentKit bearer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refreshes a stale link, so a SkillX key or session loses a refunded kit too", async () => {
    as.state.kits = ["engineer"];
    await linkAs("user-a");
    await stale();
    as.state.kits = [];
    await refreshViewerLink(ctx.env, "user-a", as.fetcher);
    expect(storedKits()).toBe("[]");
  });

  it("refreshes through an unscoped SkillX key on the credential path", async () => {
    as.state.kits = ["engineer"];
    await linkAs("user-a");
    await stale();
    as.state.kits = ["marketing"];
    vi.stubGlobal("fetch", as.fetcher);
    const key = `sx_${"a".repeat(64)}`;
    ctx.d1.raw.prepare("INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, created_at) VALUES ('k1', 'user-a', 'k', ?, 'sx_aaaaa', 1)").run(await hashApiKey(key));
    const request = new Request("https://skillx.sh/api/v1/library", { headers: { Authorization: `Bearer ${key}` } });
    expect((await resolveRequestCredential(request, ctx.env as unknown as Env)).userId).toBe("user-a");
    expect(storedKits()).toBe('["marketing"]');
  });

  it("never fails the request: an unreachable AS leaves the stored kits to lapse", async () => {
    as.state.kits = ["engineer"];
    await linkAs("user-a");
    const before = (await stale()).validatedAt;
    as.state.down = true;
    await expect(refreshViewerLink(ctx.env, "user-a", as.fetcher, Date.now() + 20 * 60_000)).resolves.toBeUndefined();
    expect((await linkOfUser(ctx.env.DB, "user-a"))!.validatedAt).toBe(before);
  });

  it("backs off after a failed refresh, so an AS outage costs one request a minute, not every request", async () => {
    as.state.kits = ["engineer"];
    await linkAs("user-a");
    await stale();
    as.state.down = true;
    const calls = as.state.tokenCalls;
    const counting = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/oauth/token")) as.state.tokenCalls++;
      return as.fetcher(input, init);
    }) as typeof fetch;
    await refreshViewerLink(ctx.env, "user-a", counting);
    await refreshViewerLink(ctx.env, "user-a", counting);
    expect(as.state.tokenCalls - calls).toBe(1);
    as.state.down = false;
    await refreshViewerLink(ctx.env, "user-a", as.fetcher, Date.now() + 61_000);
    expect((await linkOfUser(ctx.env.DB, "user-a"))!.validatedAt).toBeGreaterThan(Date.now() - 1000);
  });

  it("does nothing while the feature is off", async () => {
    as.state.kits = ["engineer"];
    await linkAs("user-a");
    await stale();
    as.state.kits = [];
    await refreshViewerLink({ ...ctx.env, SKILLX_AGENTKIT_IDENTITY: "0" }, "user-a", as.fetcher);
    expect(storedKits()).toBe('["engineer"]');
  });
});

describe("migration 0023 backfill", () => {
  const dir = new URL("../../drizzle/migrations/", import.meta.url);

  it("sets the kit of existing @agentkit packages from their newest kit release only", () => {
    const db = new DatabaseSync(":memory:");
    const files = ["0023_agentkit_kit_entitlements.sql"];
    const earlier = readdirSync(dir).filter((f) => f.endsWith(".sql") && f < files[0]!).sort();
    for (const name of earlier) {
      for (const s of readFileSync(new URL(name, dir), "utf-8").split("--> statement-breakpoint")) if (s.trim() !== "") db.exec(s);
    }
    db.exec(`
      INSERT INTO publishers (id, handle, display_name, owner_user_id, created_at, state) VALUES ('pa', 'agentkit', 'AK', NULL, 1, 'active'), ('pb', 'alpha', 'A', NULL, 1, 'active');
      INSERT INTO packages (id, publisher_id, name, slug, kind, visibility, created_at, updated_at) VALUES
        ('p1', 'pa', '@agentkit/bro', 'bro', 'skill', 'public', 1, 1),
        ('p2', 'pa', '@agentkit/advise', 'advise', 'skill', 'private', 1, 1),
        ('p3', 'pa', '@agentkit/odd', 'odd', 'skill', 'public', 1, 1),
        ('p4', 'pb', '@alpha/x', 'x', 'skill', 'public', 1, 1),
        ('p5', 'pa', '@agentkit/v1', 'v1', 'skill', 'public', 1, 1);
    `);
    const release = db.prepare("INSERT INTO package_releases (id, package_id, version, manifest_schema_version, source_provenance, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    const sp = (path: string) => JSON.stringify({ repo: "https://github.com/bestagentkits/agentkit", commit: "c".repeat(40), path });
    release.run("r1", "p1", "0.1.0", "skillx.release/v2", sp("kits/core/skills/ak-bro"), 1);
    release.run("r2", "p2", "0.1.0", "skillx.release/v2", sp("kits/core/skills/ak-advise"), 1);
    release.run("r3", "p2", "0.2.0", "skillx.release/v2", sp("kits/engineer/skills/ak-advise"), 2);
    release.run("r4", "p3", "0.1.0", "skillx.release/v2", sp("kits/engineer/skills/ak-odd/nested"), 1);
    release.run("r5", "p4", "1.0.0", "skillx.release/v2", sp("kits/engineer/skills/ak-x"), 1);
    release.run("r6", "p5", "1.0.0", "skillx.release/v1", sp("kits/engineer/skills/ak-v1"), 1);
    for (const s of readFileSync(new URL(files[0]!, dir), "utf-8").split("--> statement-breakpoint")) if (s.trim() !== "") db.exec(s);
    const kits = Object.fromEntries((db.prepare("SELECT name, kit FROM packages ORDER BY name").all() as Array<{ name: string; kit: string | null }>).map((r) => [r.name, r.kit]));
    expect(kits).toEqual({ "@agentkit/advise": "engineer", "@agentkit/bro": "core", "@agentkit/odd": null, "@agentkit/v1": null, "@alpha/x": null });
  });
});
