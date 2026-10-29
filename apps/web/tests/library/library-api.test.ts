import { BEARER_CHALLENGE } from "~/lib/agentkit/agentkit-config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIBRARY_READ_SCOPE, kitsWriteScope, releasePublishScope } from "~/lib/auth/api-key-scopes";
import { encodeCursor } from "~/lib/library/library-http";
import { libraryReleasesSql, librarySql } from "~/lib/library/library-store";
import { loader } from "~/routes/api.v1.library";
import { FakeRateLimiter } from "../releases/fake-rate-limiter";
import { file, tarOf } from "../releases/release-harness";
import { BODY, createKitHarness, skillText } from "../personal-kits/kit-harness";
import type { KitHarness } from "../personal-kits/kit-harness";

/**
 * The private library lists what the caller owns or is entitled to, skills and
 * kits together, as the caller and nobody else.
 *
 * Fixture accounts: `user-a` owns `@alpha` (and the suspended `@gone`),
 * `user-b` owns `@beta`, `user-c` owns nothing.
 */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

const tree = (name: string) => ({ "SKILL.md": skillText(BODY, `name: ${name}\ndescription: ${name}`) });

let k: KitHarness;
let aKey: string;
let bKey: string;
let cKey: string;

beforeEach(async () => {
  k = await createKitHarness();
  session.user = null;
  aKey = k.ownerKey;
  bKey = k.otherKey;
  cKey = await k.h.createKey("user-c", null);
});

interface Options {
  key?: string | null;
  query?: string;
  env?: Record<string, unknown>;
}

async function library(o: Options = {}) {
  const headers = new Headers();
  if (o.key !== undefined && o.key !== null) headers.set("Authorization", `Bearer ${o.key}`);
  const request = new Request(`https://skillx.test/api/v1/library${o.query ?? ""}`, { headers });
  const env = {
    SKILLX_RELEASES_API: "1",
    SKILLX_PERSONAL_KITS_API: "1",
    DB: k.h.deps.db,
    R2: k.h.deps.bucket,
    RELEASE_READ_LIMITER: new FakeRateLimiter(10_000),
    RELEASE_WRITE_LIMITER: new FakeRateLimiter(10_000),
    ...o.env,
  };
  const res = await loader({ request, params: {}, context: { cloudflare: { env } } } as never);
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
}

const key = (userId: string, scopes: string[] | null, revoked = false) => k.h.createKey(userId, scopes, revoked);
const privatize = (...names: string[]) => names.forEach((n) => k.sql("UPDATE packages SET visibility = 'private' WHERE name = ?", n));
const names = (body: Record<string, any>) => (body.items as Array<{ identity: string; kind: string }>).map((i) => `${i.kind}:${i.identity}`);
const grant = (subject: string, name: string, releaseVersion: string | null = null, revokedAt: number | null = null) =>
  k.sql(
    `INSERT INTO entitlements (id, subject_id, package_id, release_id, source, granted_at, revoked_at)
     SELECT ?, ?, p.id, (SELECT r.id FROM package_releases r WHERE r.package_id = p.id AND r.version = ?), 'grant', 1, ?
       FROM packages p WHERE p.name = ?`,
    `ent-${subject}-${name}-${releaseVersion ?? "all"}`,
    subject,
    releaseVersion,
    revokedAt,
    name,
  );

async function createKit(activate: boolean) {
  const document = k.doc([await k.entry("@alpha/demo", "1.0.0")]);
  const rev = (await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document })).body.revision;
  if (activate) {
    const res = await k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } });
    expect(res.status).toBe(200);
  }
  return rev as { id: string; number: number; digest: string };
}

describe("owner, entitled and unrelated accounts", () => {
  beforeEach(async () => {
    await k.publish("@alpha/demo", "1.0.0", tree("demo"));
    await k.publish("@alpha/secret", "1.0.0", tree("secret"));
    await k.publish("@beta/hidden", "1.0.0", tree("hidden"));
    privatize("@alpha/secret", "@beta/hidden");
  });

  it("lists the owner's public and private skills and kits with relation owner", async () => {
    const rev = await createKit(true);
    const res = await library({ key: aKey });
    expect(res.status).toBe(200);
    expect(res.body.schema).toBe("skillx.library/v1");
    expect(names(res.body)).toEqual(["skill:@alpha/demo", "kit:@alpha/my-kit", "skill:@alpha/secret"]);
    expect(res.body.items.every((i: any) => i.relation === "owner")).toBe(true);
    const [demo, kit, secret] = res.body.items;
    expect(kit).toMatchObject({ visibility: "private", state: "active", effectiveRevision: { id: rev.id, number: 1, digest: rev.digest }, generation: 2, installRef: `kit:@alpha/my-kit#${rev.id}` });
    expect(demo).toMatchObject({ visibility: "public", state: "published", installRef: "@alpha/demo@1.0.0" });
    expect(secret).toMatchObject({ visibility: "private", latest: { version: "1.0.0" }, installRef: "@alpha/secret@1.0.0" });
    expect(secret.latest.releaseDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(res.body.kits).toEqual({ status: "available" });
    expect(res.body.nextCursor).toBeNull();
  });

  it("shows an unrelated account nothing of another account's assets", async () => {
    await createKit(true);
    for (const [who, expected] of [[cKey, []], [bKey, ["skill:@beta/hidden"]]] as const) {
      const res = await library({ key: who });
      expect(res.status).toBe(200);
      expect(names(res.body)).toEqual(expected);
    }
  });

  it("adds a package the account is entitled to with relation entitled, owned assets staying owner", async () => {
    grant("user-b", "@alpha/secret");
    const res = await library({ key: bKey });
    expect(res.body.items.map((i: any) => [i.identity, i.relation])).toEqual([
      ["@alpha/secret", "entitled"],
      ["@beta/hidden", "owner"],
    ]);
    expect(res.body.items[0]).toMatchObject({ state: "published", installRef: "@alpha/secret@1.0.0" });
  });

  it("drops an entitlement once it is revoked", async () => {
    grant("user-c", "@alpha/secret", null, 5);
    expect((await library({ key: cKey })).body.items).toEqual([]);
  });

  it("limits a release-scoped entitlement to the entitled release", async () => {
    const v2 = await k.h.upload("@alpha/secret", tarOf([file("SKILL.md", skillText(BODY, "name: secret\ndescription: v2"))]), { version: "2.0.0", visibility: null });
    expect(v2.status).toBe(200);
    // The harness clock is fixed; order the releases explicitly.
    k.sql("UPDATE package_releases SET created_at = created_at + 1000 WHERE version = ?", "2.0.0");
    grant("user-c", "@alpha/secret", "1.0.0");
    const res = await library({ key: cKey });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ relation: "entitled", latest: { version: "1.0.0" } });
    const owner = await library({ key: aKey, query: "?q=secret" });
    expect(owner.body.items[0]).toMatchObject({ relation: "owner", latest: { version: "2.0.0" } });
  });

  it("serves the session as the signed-in account", async () => {
    session.user = { id: "user-b" };
    const res = await library();
    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(["skill:@beta/hidden"]);
  });

  it("refuses anonymous with 401 and reveals nothing", async () => {
    const res = await library();
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "auth.required", message: expect.any(String) } });
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});

describe("credentials", () => {
  beforeEach(async () => {
    await k.publish("@alpha/secret", "1.0.0", tree("secret"));
    privatize("@alpha/secret");
  });

  it("accepts a key holding library:read, acting as its owner", async () => {
    const res = await library({ key: await key("user-a", [LIBRARY_READ_SCOPE]) });
    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(["skill:@alpha/secret"]);
    const other = await library({ key: await key("user-c", [LIBRARY_READ_SCOPE, kitsWriteScope("alpha")]) });
    expect(names(other.body)).toEqual([]);
  });

  it.each([
    ["a publish-only key", () => key("user-a", [releasePublishScope("alpha")])],
    ["a kits:write-only key", () => key("user-a", [kitsWriteScope("alpha")])],
    ["a scoped key with no scopes", () => key("user-a", [])],
    ["a revoked library:read key", () => key("user-a", [LIBRARY_READ_SCOPE], true)],
    ["a revoked unscoped key", () => key("user-a", null, true)],
  ])("answers %s with 401 invalid_api_key", async (_label, make) => {
    const res = await library({ key: await make() });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_api_key");
    expect(res.headers.get("WWW-Authenticate")).toBe(BEARER_CHALLENGE);
  });

  it("never falls back to the session when the key is refused", async () => {
    session.user = { id: "user-a" };
    const res = await library({ key: await key("user-a", [releasePublishScope("alpha")]) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_api_key");
    const unknown = await library({ key: `sx_${"0".repeat(64)}` });
    expect(unknown.status).toBe(401);
  });

  it("serves an unscoped key", async () => {
    expect((await library({ key: aKey })).status).toBe(200);
  });

  it("is 404 with the unknown-resource body while the releases API is off", async () => {
    const res = await library({ key: aKey, env: { SKILLX_RELEASES_API: "0" } });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "Not found" } });
  });
});

describe("cache headers", () => {
  it("marks every success private, no-store and varying on the credential", async () => {
    await k.publish("@alpha/demo", "1.0.0", tree("demo"));
    for (const o of [{ key: aKey }, { key: cKey }]) {
      const res = await library(o);
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      expect(res.headers.get("Vary")).toBe("Authorization, Cookie");
    }
  });

  it("marks failures no-store", async () => {
    for (const res of [await library(), await library({ key: "bad" }), await library({ key: aKey, query: "?kind=nope" }), await library({ key: aKey, env: { SKILLX_RELEASES_API: "0" } })]) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});

describe("filtering and pagination", () => {
  beforeEach(async () => {
    for (const slug of ["alpha-one", "alpha-two", "beta_three", "gamma"]) await k.publish(`@alpha/${slug}`, "1.0.0", tree(slug));
    await k.publish("@alpha/demo", "1.0.0", tree("demo"));
    await createKit(false);
  });

  const walk = async (query: string) => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: Awaited<ReturnType<typeof library>> = await library({ key: aKey, query: `?${query}${cursor === null ? "" : `&cursor=${cursor}`}` });
      expect(res.status).toBe(200);
      seen.push(...names(res.body));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 20);
    return { seen, pages };
  };

  it("walks every item exactly once in name order across pages", async () => {
    const all = names((await library({ key: aKey })).body);
    expect(all).toHaveLength(6);
    const { seen, pages } = await walk("limit=2");
    expect(seen).toEqual(all);
    expect(pages).toBe(3);
  });

  it("keeps the position when assets appear or vanish between pages", async () => {
    const first = await library({ key: aKey, query: "?limit=2" });
    const cursor = first.body.nextCursor as string;
    expect(names(first.body)).toEqual(["skill:@alpha/alpha-one", "skill:@alpha/alpha-two"]);
    await k.publish("@alpha/aaa-new", "1.0.0", tree("new"));
    const second = await library({ key: aKey, query: `?limit=2&cursor=${cursor}` });
    expect(names(second.body)).toEqual(["skill:@alpha/beta_three", "skill:@alpha/demo"]);
  });

  it("filters by kind", async () => {
    expect(names((await library({ key: aKey, query: "?kind=kit" })).body)).toEqual(["kit:@alpha/my-kit"]);
    expect(names((await library({ key: aKey, query: "?kind=skill&limit=100" })).body)).not.toContain("kit:@alpha/my-kit");
  });

  it("filters by name fragment, treating LIKE wildcards literally", async () => {
    expect(names((await library({ key: aKey, query: "?q=ALPHA-" })).body)).toEqual(["skill:@alpha/alpha-one", "skill:@alpha/alpha-two"]);
    expect(names((await library({ key: aKey, query: "?q=a_t" })).body)).toEqual(["skill:@alpha/beta_three"]);
    expect(names((await library({ key: aKey, query: "?q=%25" })).body)).toEqual([]);
    expect(names((await library({ key: aKey, query: "?q=nothing" })).body)).toEqual([]);
  });

  it("clamps limit to 100 and refuses malformed paging inputs with 400", async () => {
    expect((await library({ key: aKey, query: "?limit=5000" })).status).toBe(200);
    for (const query of ["?limit=0", "?limit=-1", "?limit=abc", "?limit=1.5", "?kind=hook", "?cursor=not-a-cursor", `?cursor=${btoa('["x","nope"]')}`, `?q=${"x".repeat(65)}`]) {
      const res = await library({ key: aKey, query });
      expect(res.status, query).toBe(400);
    }
    expect((await library({ key: aKey, query: "?cursor=@@@" })).body.error.code).toBe("invalid_cursor");
  });

  it("applies a cursor only to the caller's own assets", async () => {
    const page = await library({ key: aKey, query: "?limit=2" });
    const res = await library({ key: cKey, query: `?cursor=${page.body.nextCursor}` });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});

describe("latest release selection", () => {
  const latestOf = async (who: string, name: string) => {
    const res = await library({ key: who, query: `?q=${encodeURIComponent(name.split("/")[1]!)}` });
    return res.body.items.find((i: any) => i.identity === name);
  };

  it("keeps the highest version after a backport, as a bare install resolves it", async () => {
    await k.publish("@alpha/demo", "2.0.0", tree("demo"));
    await k.publish("@alpha/demo", "1.0.1", tree("demo backport"));
    k.sql("UPDATE package_releases SET created_at = created_at + 1000 WHERE version = '1.0.1'");
    expect(await latestOf(aKey, "@alpha/demo")).toMatchObject({ latest: { version: "2.0.0" }, installRef: "@alpha/demo@2.0.0" });
  });

  it("prefers a stable release over a later prerelease", async () => {
    await k.publish("@alpha/demo", "1.0.0", tree("demo"));
    await k.publish("@alpha/demo", "2.0.0-beta.1", tree("demo beta"));
    k.sql("UPDATE package_releases SET created_at = created_at + 1000 WHERE version = '2.0.0-beta.1'");
    expect(await latestOf(aKey, "@alpha/demo")).toMatchObject({ latest: { version: "1.0.0" }, installRef: "@alpha/demo@1.0.0" });
  });

  it("offers a prerelease when it is the only readable release", async () => {
    await k.publish("@alpha/demo", "2.0.0-beta.1", tree("demo beta"));
    expect(await latestOf(aKey, "@alpha/demo")).toMatchObject({ latest: { version: "2.0.0-beta.1" } });
  });

  it("does not narrow latest of a public package by a release-scoped entitlement", async () => {
    await k.publish("@alpha/demo", "1.0.0", tree("demo"));
    await k.publish("@alpha/demo", "2.0.0", tree("demo v2"));
    grant("user-c", "@alpha/demo", "1.0.0");
    expect(await latestOf(cKey, "@alpha/demo")).toMatchObject({ relation: "entitled", latest: { version: "2.0.0" } });
  });

  it("lets a package-wide entitlement see the newest release of a private package", async () => {
    await k.publish("@alpha/secret", "1.0.0", tree("secret"));
    await k.publish("@alpha/secret", "1.2.0", tree("secret v2"));
    privatize("@alpha/secret");
    grant("user-c", "@alpha/secret");
    expect(await latestOf(cKey, "@alpha/secret")).toMatchObject({ latest: { version: "1.2.0" } });
  });

  it("reports owner when the account is both the owner and entitled", async () => {
    await k.publish("@alpha/secret", "1.0.0", tree("secret"));
    privatize("@alpha/secret");
    grant("user-a", "@alpha/secret", "1.0.0");
    expect(await latestOf(aKey, "@alpha/secret")).toMatchObject({ relation: "owner", state: "published" });
    expect((await library({ key: aKey })).body.items).toHaveLength(1);
  });

  it.each(["yanked", "quarantined"])("reports no_release when the only entitled release is %s", async (state) => {
    await k.publish("@alpha/secret", "1.0.0", tree("secret"));
    await k.publish("@alpha/secret", "2.0.0", tree("secret v2"));
    privatize("@alpha/secret");
    grant("user-c", "@alpha/secret", "1.0.0");
    k.sql("UPDATE package_releases SET release_state = ? WHERE version = '1.0.0'", state);
    expect(await latestOf(cKey, "@alpha/secret")).toMatchObject({ relation: "entitled", state: "no_release", latest: null, installRef: null });
  });

  it("skips a tree quarantined through another package's release", async () => {
    await k.publish("@alpha/demo", "1.0.0", tree("demo"));
    await k.publish("@alpha/demo", "1.1.0", tree("demo v1.1"));
    await k.publish("@alpha/other", "1.0.0", tree("other"));
    // The quarantined release of @alpha/other carries the digest of demo@1.1.0.
    k.sql(
      `UPDATE package_releases SET release_state = 'quarantined',
              release_digest = (SELECT x.release_digest FROM package_releases x WHERE x.version = '1.1.0')
        WHERE package_id = (SELECT id FROM packages WHERE name = '@alpha/other')`,
    );
    expect(await latestOf(aKey, "@alpha/demo")).toMatchObject({ latest: { version: "1.0.0" } });
  });
});

describe("cursor encoding", () => {
  it("encodes non-ASCII identities without throwing and decodes them back", async () => {
    const cursor = encodeCursor("@alpha/ünï-€", "skill");
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const res = await library({ key: aKey, query: `?cursor=${cursor}` });
    expect(res.status).toBe(200);
  });
});

describe("query plan", () => {
  const plan = (sql: string, ...params: Array<string | number | null>) =>
    (k.h.d1.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as Array<{ detail: string }>).map((r) => r.detail);

  it("drives the listing from the caller's ids and never scans packages or releases", () => {
    const details = plan(librarySql(true), "user-a", null, null, null, null, 101);
    expect(details.join("\n")).toMatch(/idx_publishers_owner/);
    expect(details.join("\n")).toMatch(/idx_entitlements_subject/);
    for (const d of details) expect(d, d).not.toMatch(/\bSCAN (p|p2|pub|o|e|k|x|packages|package_releases|publishers|entitlements)\b/);
  });

  it("reads releases through the per-package version index", () => {
    const details = plan(libraryReleasesSql, "user-a", JSON.stringify(["pkg-1"]));
    expect(details.join("\n")).toMatch(/idx_package_releases_version/);
    for (const d of details) expect(d, d).not.toMatch(/\bSCAN (x|package_releases)\b/);
    expect(details.join("\n")).not.toMatch(/idx_package_releases_state/);
  });
});

describe("item states", () => {
  it("reports publisher_suspended without a release or install ref", async () => {
    await k.publish("@alpha/demo", "1.0.0", tree("demo"));
    k.sql("UPDATE publishers SET state = 'suspended' WHERE handle = 'alpha'");
    const res = await library({ key: aKey });
    expect(res.body.items[0]).toMatchObject({ identity: "@alpha/demo", state: "publisher_suspended", latest: null, installRef: null });
  });

  it("reports no_release when the only release is yanked", async () => {
    await k.publish("@alpha/demo", "1.0.0", tree("demo"));
    k.sql("UPDATE package_releases SET release_state = 'yanked'");
    const res = await library({ key: aKey });
    expect(res.body.items[0]).toMatchObject({ state: "no_release", latest: null, installRef: null });
  });

  it("skips a release whose tree is quarantined and offers the previous one", async () => {
    await k.publish("@alpha/demo", "1.0.0", tree("demo"));
    await k.publish("@alpha/demo", "1.1.0", tree("demo v1.1"));
    k.sql("UPDATE package_releases SET release_state = 'quarantined' WHERE version = '1.1.0'");
    const res = await library({ key: aKey });
    expect(res.body.items[0]).toMatchObject({ state: "published", latest: { version: "1.0.0" } });
  });

  it("reports a kit without an active revision and one with a quarantined revision", async () => {
    await k.publish("@alpha/demo", "1.0.0", tree("demo"));
    const rev = await createKit(false);
    let kit = (await library({ key: aKey, query: "?kind=kit" })).body.items[0];
    expect(kit).toMatchObject({ state: "no_active_revision", effectiveRevision: null, installRef: null, latestRevisionNumber: 1 });
    await k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } });
    k.sql("UPDATE personal_kit_revisions SET state = 'quarantined' WHERE id = ?", rev.id);
    kit = (await library({ key: aKey, query: "?kind=kit" })).body.items[0];
    expect(kit).toMatchObject({ state: "quarantined", installRef: null });
  });

  it("states that kits are unavailable instead of returning an empty list while the kit API is off", async () => {
    await k.publish("@alpha/demo", "1.0.0", tree("demo"));
    await createKit(true);
    const off = { SKILLX_PERSONAL_KITS_API: "0" };
    const all = await library({ key: aKey, env: off });
    expect(all.status).toBe(200);
    expect(all.body.kits).toEqual({ status: "unavailable", code: "kit.api_disabled" });
    expect(names(all.body)).toEqual(["skill:@alpha/demo"]);
    const kitsOnly = await library({ key: aKey, query: "?kind=kit", env: off });
    expect(kitsOnly.body.items).toEqual([]);
    expect(kitsOnly.body.kits.code).toBe("kit.api_disabled");
  });
});
