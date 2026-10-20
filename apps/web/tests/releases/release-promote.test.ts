import { beforeEach, describe, expect, it, vi } from "vitest";
import { action as promoteAction } from "~/routes/api.v1.release-promote";
import { releasePublishScope } from "~/lib/auth/api-key-scopes";
import { mintOidcPublishToken } from "~/lib/releases/trusted-publish-token";
import { tarOf } from "./release-harness";
import { ADMIN, audit, change, envOf, expectError, publish, skillFiles, sql, useStateHarness } from "./release-state-helpers";
import type { Harness } from "./release-state-helpers";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

const SECRET = "test-token-secret-0123456789abcdef";
let h: Harness;
let ownerKey: string;
let otherKey: string;

beforeEach(async () => {
  h = await useStateHarness();
  session.user = null;
  ownerKey = await h.createKey("user-a", null);
  otherKey = await h.createKey("user-b", null);
});

async function promote(body: unknown, auth: { key?: string; admin?: string } = {}, name = "@alpha/demo", version = "1.0.0") {
  const [scope, slug] = name.split("/") as [string, string];
  const headers = new Headers({ "Content-Type": "application/json" });
  if (auth.key !== undefined) headers.set("Authorization", `Bearer ${auth.key}`);
  if (auth.admin !== undefined) headers.set("X-Admin-Secret", auth.admin);
  const request = new Request(`https://skillx.test/api/v1/packages/${name}/releases/${version}/promote`, { method: "POST", headers, body: JSON.stringify(body) });
  const res = await promoteAction({ request, params: { scope, slug, version }, context: { cloudflare: { env: envOf({ SKILLX_TOKEN_SECRET: SECRET }) } } } as never);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const channelOf = (version = "1.0.0") =>
  (h.d1.raw.prepare("SELECT r.channel AS c FROM package_releases r JOIN packages p ON p.id = r.package_id WHERE p.name = '@alpha/demo' AND r.version = ?").get(version) as { c: string }).c;

async function publishBeta() {
  const res = await h.upload("@alpha/demo", tarOf(skillFiles()), {
    metadata: { version: "1.0.0", channel: "beta" },
  });
  expect(res.status).toBe(200);
}

describe("release promote", () => {
  it("lets the scoped publish key promote beta -> stable, audited as release_channel", async () => {
    await publishBeta();
    const res = await promote({ to: "stable", reason: "soak passed" }, { key: h.alphaKey });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ identity: "@alpha/demo", version: "1.0.0", from: "beta", to: "stable", channel: "stable" });
    expect(channelOf()).toBe("stable");
    expect(audit().at(-1)).toMatchObject({ subject_kind: "release_channel", actor_kind: "publisher_key", from_state: "beta", to_state: "stable", outcome: "applied", reason: "soak passed" });
  });

  it("forbids a publisher credential from demoting, but lets the owner and the admin", async () => {
    await publish();
    expectError(await promote({ to: "beta" }, { key: h.alphaKey }), 403, "promote.demotion_forbidden");
    expect(audit().at(-1)).toMatchObject({ subject_kind: "release_channel", outcome: "denied" });
    expect((await promote({ to: "beta" }, { key: ownerKey })).status).toBe(200);
    expect((await promote({ to: "alpha" }, { admin: ADMIN })).status).toBe(200);
    expect(channelOf()).toBe("alpha");
  });

  it("accepts an OIDC publish token of the handle, refuses one for another handle", async () => {
    await publishBeta();
    sql("INSERT INTO trusted_publishers (id, publisher_id, provider, repository, repository_id, workflow_path, state, created_at) VALUES ('tp-1', 'pub-alpha', 'github', 'o/r', '1', '.github/workflows/p.yml', 'active', 1)");
    const { token } = await mintOidcPublishToken(SECRET, { handle: "alpha", publisherId: "pub-alpha", trustedPublisherId: "tp-1", jti: "j1" }, new Date());
    expect((await promote({ to: "stable" }, { key: token })).status).toBe(200);
    const { token: other } = await mintOidcPublishToken(SECRET, { handle: "beta", publisherId: "pub-beta", trustedPublisherId: "tp-1", jti: "j2" }, new Date());
    expect((await promote({ to: "beta" }, { key: other })).status).toBe(403);
    sql("UPDATE trusted_publishers SET state = 'revoked'");
    expect((await promote({ to: "beta" }, { key: token })).status).toBe(401);
  });

  it("refuses non-owners, the same channel, stale from, and unpublished releases", async () => {
    await publish();
    expectError(await promote({ to: "beta" }, { key: otherKey }), 403, "transition.not_owner");
    expectError(await promote({ to: "stable" }, { key: ownerKey }), 422, "promote.same_channel");
    expectError(await promote({ from: "beta", to: "alpha" }, { key: ownerKey }), 409, "state_conflict");
    expect((await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" }, { key: ownerKey })).status).toBe(200);
    expectError(await promote({ to: "beta" }, { key: ownerKey }), 409, "promote.not_published");
    expect(channelOf()).toBe("stable");
  });

  it("validates the body and the credential", async () => {
    await publish();
    expectError(await promote({ to: "nightly" }, { key: ownerKey }), 400, "invalid_request");
    expectError(await promote({ to: "beta", extra: 1 }, { key: ownerKey }), 400, "invalid_request");
    expect((await promote({ to: "beta" })).status).toBe(401);
    const otherScoped = await h.createKey("user-b", [releasePublishScope("beta")]);
    expect((await promote({ to: "beta" }, { key: otherScoped })).status).toBe(403);
  });
});
