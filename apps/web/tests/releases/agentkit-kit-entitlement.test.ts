import { beforeEach, describe, expect, it } from "vitest";
import { baseFailure, loadPinnedBase, loadUpstream, newBaseCache } from "~/lib/personal-kits/base-loader";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { loader as listLoader } from "~/routes/api.v1.package-releases";
import { queryLibrary } from "~/lib/library/library-store";
import { FakeRateLimiter } from "./fake-rate-limiter";
import { createHarness, file, tarOf } from "./release-harness";

/**
 * Paid AgentKit kit content: an `@agentkit/*` kit release records the kit of
 * its source path (`kits/<kit>/skills/<dir>`) on the package, and a linked
 * AgentKit account whose last token named that kit (`agentkit_links.kits`)
 * reads the package's private releases (`kitEntitled`).
 * Nobody else does, and an unlinked account loses the grant at once.
 */

type Harness = Awaited<ReturnType<typeof createHarness>>;
const KIT = { provider: "kit", origin: "remote-signed" } as const;
const REPO = "https://github.com/bestagentkits/agentkit";
const skillFiles = (name: string) => [file("SKILL.md", `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\n`)];

let h: Harness;
let agentkitKey: string;
let buyerKey: string;

beforeEach(async () => {
  h = await createHarness();
  agentkitKey = await h.createKey("user-a", ["releases:publish:@agentkit"]);
  buyerKey = await h.createKey("user-b", null);
  for (const id of ["user-a", "user-b"]) {
    h.d1.raw.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)').run(id, id, `${id}@example.test`);
  }
});

function publishKit(slug: string, kit: string, visibility: "public" | "private", version = "0.2.0", path = `kits/${kit}/skills/ak-${slug}`) {
  return h.upload(`@agentkit/${slug}`, tarOf(skillFiles(slug)), {
    key: agentkitKey,
    metadata: { version, provenance: KIT, visibility, sourceProvenance: { repo: REPO, commit: "c".repeat(40), path } },
  });
}

const kitOf = (name: string) => (h.d1.raw.prepare("SELECT kit FROM packages WHERE name = ?").get(name) as { kit: string | null }).kit;

function link(userId: string, kits: string, validatedAt = Date.now()) {
  h.d1.raw
    .prepare("INSERT INTO agentkit_links (user_id, issuer, agentkit_sub, scopes, refresh_token_enc, linked_at, validated_at, kits) VALUES (?, 'https://as.test', ?, '', NULL, 1, ?, ?)")
    .run(userId, `sub-${userId}`, validatedAt, kits);
}

const env = () => ({ SKILLX_RELEASES_API: "1", DB: h.deps.db, R2: h.deps.bucket, RELEASE_READ_LIMITER: new FakeRateLimiter(10_000) });

function readManifest(slug: string, version: string, key: string | null = buyerKey) {
  const headers = new Headers();
  if (key !== null) headers.set("Authorization", `Bearer ${key}`);
  const request = new Request(`https://skillx.test/api/v1/packages/@agentkit/${slug}/releases/${version}`, { headers });
  return manifestLoader({ request, params: { scope: "@agentkit", slug, version }, context: { cloudflare: { env: env() } } } as never);
}

function listReleases(slug: string, key: string | null = buyerKey) {
  const headers = new Headers();
  if (key !== null) headers.set("Authorization", `Bearer ${key}`);
  const request = new Request(`https://skillx.test/api/v1/packages/@agentkit/${slug}/releases`, { headers });
  return listLoader({ request, params: { scope: "@agentkit", slug }, context: { cloudflare: { env: env() } } } as never);
}

describe("kit of an @agentkit kit release", () => {
  it("is read from the kit source path, and never moves to another kit", async () => {
    expect((await publishKit("advise", "engineer", "private")).status).toBe(200);
    expect(kitOf("@agentkit/advise")).toBe("engineer");
    const moved = await publishKit("advise", "marketing", "private", "0.3.0");
    expect(moved).toMatchObject({ status: 409, body: { error: { code: "release.kit_mismatch" } } });
    expect(kitOf("@agentkit/advise")).toBe("engineer");
    expect((await publishKit("advise", "engineer", "private", "0.3.0")).status).toBe(200);
  });

  it("is not set for another source layout", async () => {
    expect((await publishKit("odd", "engineer", "public", "0.2.0", "skills/ak-odd")).status).toBe(200);
    expect(kitOf("@agentkit/odd")).toBeNull();
    expect((await publishKit("nested", "engineer", "public", "0.2.0", "kits/engineer/skills/ak-nested/sub")).status).toBe(200);
    expect(kitOf("@agentkit/nested")).toBeNull();
  });

  it("is never set for an ordinary release", async () => {
    const res = await h.upload("@alpha/kits", tarOf(skillFiles("kits")), {
      metadata: { version: "1.0.0", sourceProvenance: { repo: REPO, commit: "c".repeat(40), path: "kits/engineer/skills/ak-kits" } },
    });
    expect(res.status).toBe(200);
    expect(kitOf("@alpha/kits")).toBeNull();
  });
});

describe("paid kit entitlement through a linked AgentKit account", () => {
  beforeEach(async () => {
    expect((await publishKit("advise", "engineer", "private")).status).toBe(200);
  });

  it("refuses an account that is not linked, exactly like an unknown package", async () => {
    expect((await readManifest("advise", "0.2.0")).status).toBe(404);
    expect((await readManifest("advise", "0.2.0", null)).status).toBe(404);
    expect((await listReleases("advise")).status).toBe(404);
  });

  it("refuses a linked account that does not own the kit", async () => {
    link("user-b", '["marketing"]');
    expect((await readManifest("advise", "0.2.0")).status).toBe(404);
    link("user-a", "[]");
    expect((await listReleases("advise", null)).status).toBe(404);
  });

  it("serves every release of the kit's packages to a linked account that owns it", async () => {
    link("user-b", '["engineer","marketing"]');
    expect((await readManifest("advise", "0.2.0")).status).toBe(200);
    expect((await publishKit("advise", "engineer", "private", "0.2.1")).status).toBe(200);
    expect((await readManifest("advise", "0.2.1")).status).toBe(200);
    const listed = (await (await listReleases("advise")).json()) as { releases: Array<{ version: string }> };
    expect(listed.releases.map((r) => r.version).sort()).toEqual(["0.2.0", "0.2.1"]);
  });

  it("never matches a kit name by prefix", async () => {
    link("user-b", '["engineer-lite"]');
    expect((await readManifest("advise", "0.2.0")).status).toBe(404);
  });

  it("drops the grant when the link is removed or the kit leaves the claim", async () => {
    link("user-b", '["engineer"]');
    expect((await readManifest("advise", "0.2.0")).status).toBe(200);
    h.d1.raw.prepare("UPDATE agentkit_links SET kits = '[]' WHERE user_id = 'user-b'").run();
    expect((await readManifest("advise", "0.2.0")).status).toBe(404);
    h.d1.raw.prepare(`UPDATE agentkit_links SET kits = '["engineer"]' WHERE user_id = 'user-b'`).run();
    h.d1.raw.prepare("DELETE FROM agentkit_links WHERE user_id = 'user-b'").run();
    expect((await readManifest("advise", "0.2.0")).status).toBe(404);
  });

  it("lists the kit's packages in the library of a fresh link only", async () => {
    const library = async () =>
      (await queryLibrary(h.deps.db, { userId: "user-b", kind: null, q: null, after: null, limit: 10, includeKits: false })).items.map((i) => [i.identity, i.relation, i.installRef]);
    expect(await library()).toEqual([]);
    link("user-b", '["engineer"]');
    expect(await library()).toEqual([["@agentkit/advise", "entitled", "@agentkit/advise@0.2.0"]]);
    h.d1.raw.prepare("UPDATE agentkit_links SET validated_at = ? WHERE user_id = 'user-b'").run(Date.now() - 16 * 60_000);
    expect(await library()).toEqual([]);
  });

  it("grants nothing on a link no refresh confirmed within the outage grace", async () => {
    link("user-b", '["engineer"]', Date.now() - 16 * 60_000);
    expect((await readManifest("advise", "0.2.0")).status).toBe(404);
    expect((await listReleases("advise")).status).toBe(404);
    h.d1.raw.prepare("UPDATE agentkit_links SET validated_at = ? WHERE user_id = 'user-b'").run(Date.now() - 14 * 60_000);
    expect((await readManifest("advise", "0.2.0")).status).toBe(200);
  });

  it("grants nothing outside @agentkit, even with a kit set on the package", async () => {
    const res = await h.upload("@alpha/secret", tarOf(skillFiles("secret")), { visibility: "private" });
    expect(res.status).toBe(200);
    h.d1.raw.prepare("UPDATE packages SET kit = 'engineer' WHERE name = '@alpha/secret'").run();
    link("user-b", '["engineer"]');
    const request = new Request("https://skillx.test/api/v1/packages/@alpha/secret/releases/1.0.0", { headers: { Authorization: `Bearer ${buyerKey}` } });
    const served = await manifestLoader({ request, params: { scope: "@alpha", slug: "secret", version: "1.0.0" }, context: { cloudflare: { env: env() } } } as never);
    expect(served.status).toBe(404);
  });
});

describe("base failures of a personal kit", () => {
  const pin = (pkg: string, version: string, releaseDigest: string) => ({ package: pkg, version, releaseDigest });
  const failureOf = async (load: Promise<unknown>) => baseFailure(await load.then(() => null, (error: unknown) => error));
  const loaderEnv = () => ({ DB: h.deps.db, R2: h.deps.bucket }) as unknown as Env;

  it("reports an @agentkit base that is not published as missing, not as an entitlement", async () => {
    const digest = `sha256:${"0".repeat(64)}`;
    expect(await failureOf(loadPinnedBase(loaderEnv(), "user-b", pin("@agentkit/plan", "0.2.0", digest), newBaseCache()))).toBe("missing");
    expect(await failureOf(loadUpstream(loaderEnv(), "user-b", "@agentkit/plan", "0.2.0", newBaseCache()))).toBe("missing");
  });

  it("reports a published @agentkit base the account may not read as an entitlement", async () => {
    const res = await publishKit("advise", "engineer", "private");
    const digest = res.body.releaseDigest as string;
    expect(await failureOf(loadPinnedBase(loaderEnv(), "user-b", pin("@agentkit/advise", "0.2.0", digest), newBaseCache()))).toBe("entitlement");
    expect(await failureOf(loadUpstream(loaderEnv(), "user-b", "@agentkit/advise", "0.2.0", newBaseCache()))).toBe("entitlement");
    // Another digest under a published version is a pin that does not exist.
    expect(await failureOf(loadPinnedBase(loaderEnv(), "user-b", pin("@agentkit/advise", "0.2.0", `sha256:${"1".repeat(64)}`), newBaseCache()))).toBe("missing");
    link("user-b", '["engineer"]');
    const loaded = await loadPinnedBase(loaderEnv(), "user-b", pin("@agentkit/advise", "0.2.0", digest), newBaseCache());
    expect(loaded.release.identity).toBe("@agentkit/advise");
  });

  it("keeps the one not-found answer for any other package, so a private package's existence never shows", async () => {
    const digest = `sha256:${"0".repeat(64)}`;
    expect(await failureOf(loadUpstream(loaderEnv(), "user-b", "@alpha/nope", "1.0.0", newBaseCache()))).toBe("entitlement");
    await h.upload("@alpha/secret", tarOf(skillFiles("secret")), { visibility: "private" });
    expect(await failureOf(loadUpstream(loaderEnv(), "user-b", "@alpha/secret", "1.0.0", newBaseCache()))).toBe("entitlement");
    expect(await failureOf(loadPinnedBase(loaderEnv(), "user-b", pin("@alpha/nope", "1.0.0", digest), newBaseCache()))).toBe("entitlement");
  });
});
