/**
 * The MCP `get_release` tool against the real release access module.
 *
 * The tool must reach the same answer as the public release API for the same
 * package: a private package, a draft and a quarantined tree are never served,
 * and the MCP caller is always the anonymous viewer, so a session or API key on
 * the MCP request grants nothing here.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { callTool } from "~/lib/mcp/tools";
import { MAX_MCP_RELEASES } from "~/lib/mcp/handlers-releases";
import { explainFailure } from "~/lib/mcp/trust";
import { createHarness, file, tarOf } from "./release-harness";

type Harness = Awaited<ReturnType<typeof createHarness>>;
let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

const skillFiles = () => [file("SKILL.md", "---\nname: demo\ndescription: Demo skill\n---\n# Demo\n")];

async function publish(version = "1.0.0", files = skillFiles()) {
  const res = await h.upload("@alpha/demo", tarOf(files), { version });
  expect(res.status).toBe(200);
  return res.body as { releaseDigest: string; state: string };
}

const sql = (statement: string, ...params: Array<string | number | null>) => h.d1.raw.prepare(statement).run(...params);

async function getRelease(args: Record<string, unknown>, options: { flag?: string; userId?: string | null } = {}) {
  const env = { SKILLX_RELEASES_API: options.flag ?? "1", DB: h.deps.db } as unknown as Env;
  const result = await callTool("get_release", args, { env, userId: options.userId ?? null });
  return { isError: result.isError === true, body: JSON.parse(result.content[0].text) as Record<string, any> };
}

describe("get_release", () => {
  it("serves a published release with exactly the public list fields", async () => {
    const published = await publish();
    const { isError, body } = await getRelease({ package: "@alpha/demo", version: "1.0.0" });

    expect(isError).toBe(false);
    expect(body.found).toBe(true);
    expect(body.package).toBe("@alpha/demo");
    expect(Object.keys(body.release).sort()).toEqual(
      ["artifactDigest", "artifactSize", "channel", "createdAt", "releaseDigest", "state", "version"].sort(),
    );
    expect(body.release.releaseDigest).toBe(published.releaseDigest);
    expect(body.release.state).toBe("published");
  });

  it("lists published releases newest first and bounds the list", async () => {
    await publish("1.0.0");
    await publish("1.1.0", [...skillFiles(), file("notes.md", "v1.1\n")]);
    // Both uploads share the harness clock; order them explicitly.
    sql("UPDATE package_releases SET created_at = created_at - 1000 WHERE version = '1.0.0'");
    const { body } = await getRelease({ package: "@alpha/demo" });

    expect(body.found).toBe(true);
    expect(body.releases.length).toBeLessThanOrEqual(MAX_MCP_RELEASES);
    expect(body.releases.map((r: { version: string }) => r.version)).toEqual(["1.1.0", "1.0.0"]);
  });

  it("answers a private package like an unknown one, even for its owner's session", async () => {
    await publish();
    sql("UPDATE packages SET visibility = 'private' WHERE name = '@alpha/demo'");
    const unknown = await getRelease({ package: "@alpha/nope", version: "1.0.0" });
    const owner = await getRelease({ package: "@alpha/demo", version: "1.0.0" }, { userId: "user-a" });
    const listing = await getRelease({ package: "@alpha/demo" }, { userId: "user-a" });

    expect(unknown.body).toMatchObject({ found: false, code: "not_found" });
    expect(owner.body).toEqual({ found: false, code: "not_found", explanation: explainFailure("not_found"), package: "@alpha/demo", version: "1.0.0" });
    expect(listing.body).toMatchObject({ found: false, code: "not_found" });
  });

  it("never serves a draft", async () => {
    await publish();
    sql("UPDATE package_releases SET release_state = 'draft', published_at = NULL WHERE version = '1.0.0'");
    const pinned = await getRelease({ package: "@alpha/demo", version: "1.0.0" });
    const listing = await getRelease({ package: "@alpha/demo" });

    expect(pinned.body.found).toBe(false);
    expect(pinned.body.release).toBeUndefined();
    expect(listing.body.releases ?? []).toEqual([]);
  });

  it("refuses a quarantined tree and hides it from the listing", async () => {
    await publish("1.0.0");
    const secret = "AKIA" + "ABCDEFGHIJKLMNOP";
    const leaky = await publish("1.1.0", [...skillFiles(), file("config.env", `AWS_KEY=${secret}\n`)]);
    expect(leaky.state).toBe("quarantined");

    const pinned = await getRelease({ package: "@alpha/demo", version: "1.1.0" });
    const listing = await getRelease({ package: "@alpha/demo" });

    expect(pinned.body).toEqual({ found: false, code: "release_quarantined", explanation: explainFailure("release_quarantined"), package: "@alpha/demo", version: "1.1.0" });
    expect(listing.body.releases.map((r: { version: string }) => r.version)).toEqual(["1.0.0"]);
    expect(JSON.stringify(pinned.body)).not.toContain(secret);
  });

  it("answers like an unknown package when the release API is off", async () => {
    await publish();
    const { body } = await getRelease({ package: "@alpha/demo", version: "1.0.0" }, { flag: "0" });
    expect(body).toMatchObject({ found: false, code: "not_found" });
  });

  it("refuses malformed identities and versions as argument errors", async () => {
    for (const args of [{ package: "no-scope" }, { package: "@alpha/demo", version: "not-semver" }]) {
      const { isError, body } = await getRelease(args);
      expect(isError, JSON.stringify(args)).toBe(true);
      expect(body.details.code).toBe("invalid_arguments");
    }
  });
});
