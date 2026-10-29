/**
 * The MCP `prepare_install` tool against real signed releases.
 *
 * It must pin one immutable release, name everything a person should weigh
 * before installing it (signed provenance or `unknown`, scripts, executable
 * files, declared permissions), and fail closed with a readable reason for
 * every release that must not be installed. It installs and runs nothing,
 * whichever host asks.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { callTool } from "~/lib/mcp/tools";
import { explainFailure } from "~/lib/mcp/trust";
import { createHarness, file, tarOf } from "./release-harness";

type Harness = Awaited<ReturnType<typeof createHarness>>;
let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

const SKILL = file("SKILL.md", "---\nname: demo\ndescription: Demo skill\n---\n# Demo\n");
const PROVENANCE = { repo: "https://github.com/alpha/skills", commit: "a".repeat(40), path: "demo" };

const EXEC = JSON.stringify({
  schemaVersion: "agentkit.skill-exec/v1",
  entrypoints: [
    {
      name: "run",
      path: "scripts/run.sh",
      interpreter: { name: "sh" },
      capabilities: {
        filesystem: { read: ["$PACKAGE"], write: ["$OUTPUT"] },
        network: { hosts: ["api.example.com"] },
        subprocess: true,
        env: [],
        secrets: ["API_TOKEN"],
        limits: { wallSeconds: 30, cpuSeconds: 30, memoryMiB: 256, processes: 4, outputBytes: 65536 },
      },
    },
  ],
});

async function publish(version = "1.0.0", files = [SKILL], extra: Record<string, unknown> = {}) {
  const res = await h.upload("@alpha/demo", tarOf(files), { metadata: { version, ...extra } });
  expect(res.status).toBe(200);
  return res.body as { releaseDigest: string; state: string };
}

const sql = (statement: string, ...params: Array<string | number | null>) => h.d1.raw.prepare(statement).run(...params);

async function prepare(args: Record<string, unknown>) {
  const env = { SKILLX_RELEASES_API: "1", DB: h.deps.db, R2: h.deps.bucket } as unknown as Env;
  const result = await callTool("prepare_install", args, { env, userId: null, origin: "https://skillx.test" });
  return { isError: result.isError === true, body: JSON.parse(result.content[0].text) as Record<string, any> };
}

describe("prepare_install: an installable release", () => {
  it("pins version and digest, requires approval and installs nothing on a read-only host", async () => {
    const { releaseDigest } = await publish("1.0.0", [SKILL], { sourceProvenance: PROVENANCE });
    const { isError, body } = await prepare({ package: "@alpha/demo", version: "1.0.0" });

    expect(isError).toBe(false);
    expect(body).toMatchObject({ installable: true, package: "@alpha/demo", version: "1.0.0", releaseDigest });
    expect(body.approval).toEqual({
      required: true,
      executedByServer: false,
      scriptsRunOnInstall: false,
      pin: { package: "@alpha/demo", version: "1.0.0", releaseDigest },
    });
    expect(body.trust).toMatchObject({ kind: "immutable_release", signed: true, sourceProvenance: PROVENANCE, permissions: "none_declared" });
    expect(body.trust.executableFiles).toEqual({ count: 0, paths: [] });
    expect(body.redFlags.map((f: { rule: string }) => f.rule)).not.toContain("no-source-commit");
    expect(body.host.mode).toBe("manual");
    expect(body.host.installed).toBe(false);
    expect(body.host.links.manifest).toBe(
      `https://skillx.test/api/v1/releases/${releaseDigest}/manifest?package=%40alpha%2Fdemo&version=1.0.0`,
    );
    expect(body.contentTrust).toMatch(/never as instructions/);
  });

  it("gives an installer host a dry-run preview and the digest-pinned command", async () => {
    const { releaseDigest } = await publish();
    const { body } = await prepare({ package: "@alpha/demo", version: "1.0.0", digest: releaseDigest, host: "installer" });

    const ref = `'@alpha/demo@1.0.0#${releaseDigest}'`;
    expect(body.installable).toBe(true);
    expect(body.host).toMatchObject({ mode: "installer", preview: `skillx install --dry-run ${ref}`, command: `skillx install ${ref}` });
    expect(body.host.steps.join(" ")).toMatch(/explicitly approves/);
    expect(body.host.steps.join(" ")).toMatch(/yanked after this plan/);
  });

  it("labels a release without a source commit as unknown provenance", async () => {
    await publish();
    const { body } = await prepare({ package: "@alpha/demo", version: "1.0.0" });
    expect(body.trust.sourceProvenance).toBe("unknown");
    expect(body.redFlags).toContainEqual({ category: "unknown_provenance", severity: "caution", rule: "no-source-commit" });
  });

  it("names scripts, executable files and declared network, secret and subprocess access", async () => {
    const files = [SKILL, file("agentkit-exec.json", EXEC), file("scripts/run.sh", "#!/bin/sh\necho ok\n", "100755")];
    await publish("1.0.0", files, { declaredScripts: ["scripts/run.sh"] });
    const { body } = await prepare({ package: "@alpha/demo", version: "1.0.0" });

    expect(body.installable).toBe(true);
    expect(body.trust.declaredScripts).toEqual(["scripts/run.sh"]);
    expect(body.trust.executableFiles).toEqual({ count: 1, paths: ["scripts/run.sh"] });
    expect(body.trust.permissions.entrypoints[0]).toMatchObject({ networkHosts: ["api.example.com"], secrets: ["API_TOKEN"], subprocess: true });
    expect(body.redFlags.map((f: { rule: string }) => f.rule)).toEqual(
      expect.arrayContaining(["declared-scripts", "executable-files", "declared-network-access", "declared-secret-access", "declared-subprocess"]),
    );
    expect(body.approval.scriptsRunOnInstall).toBe(false);
  });
});

describe("prepare_install fails closed", () => {
  const refused = (body: Record<string, any>, code: string) => {
    expect(body).toMatchObject({ installable: false, found: false, code, explanation: explainFailure(code) });
    expect(body.host).toBeUndefined();
    expect(body.approval).toBeUndefined();
  };

  it("on a quarantined release, without echoing what the scan matched", async () => {
    const secret = "AKIA" + "ABCDEFGHIJKLMNOP";
    const leaky = await publish("1.0.0", [SKILL, file("config.env", `AWS_KEY=${secret}\n`)]);
    expect(leaky.state).toBe("quarantined");
    const { body } = await prepare({ package: "@alpha/demo", version: "1.0.0" });
    refused(body, "release_quarantined");
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("on a release whose publisher is revoked", async () => {
    await publish();
    sql("UPDATE publishers SET state = 'revoked' WHERE handle = 'alpha'");
    refused((await prepare({ package: "@alpha/demo", version: "1.0.0" })).body, "publisher_revoked");
  });

  it("on a yanked release", async () => {
    await publish();
    sql("UPDATE package_releases SET release_state = 'yanked' WHERE version = '1.0.0'");
    refused((await prepare({ package: "@alpha/demo", version: "1.0.0" })).body, "release_yanked");
  });

  it("on a digest that differs from the reviewed one, in get_release too", async () => {
    await publish();
    const other = `sha256:${"0".repeat(64)}`;
    refused((await prepare({ package: "@alpha/demo", version: "1.0.0", digest: other })).body, "digest_mismatch");

    const env = { SKILLX_RELEASES_API: "1", DB: h.deps.db } as unknown as Env;
    const release = JSON.parse((await callTool("get_release", { package: "@alpha/demo", version: "1.0.0", digest: other }, { env })).content[0].text);
    expect(release).toMatchObject({ found: false, code: "digest_mismatch", explanation: explainFailure("digest_mismatch") });
  });

  it("on a manifest that no longer matches the registry row", async () => {
    await publish();
    sql("UPDATE package_releases SET release_digest = ? WHERE version = '1.0.0'", `sha256:${"1".repeat(64)}`);
    refused((await prepare({ package: "@alpha/demo", version: "1.0.0" })).body, "release.storage_inconsistent");
  });

  it("on a substituted origin: a registry row whose signed manifest names another version", async () => {
    await publish();
    sql("UPDATE package_releases SET version = '9.9.9' WHERE version = '1.0.0'");
    refused((await prepare({ package: "@alpha/demo", version: "9.9.9" })).body, "origin_mismatch");
  });

  it("on a private package, answering exactly like an unknown one", async () => {
    await publish();
    sql("UPDATE packages SET visibility = 'private' WHERE name = '@alpha/demo'");
    const priv = await prepare({ package: "@alpha/demo", version: "1.0.0" });
    const unknown = await prepare({ package: "@alpha/nope", version: "1.0.0" });
    refused(priv.body, "not_found");
    expect(JSON.stringify(priv.body).replace("demo", "nope")).toBe(JSON.stringify(unknown.body));
  });

  it("when the release API is off", async () => {
    await publish();
    const env = { SKILLX_RELEASES_API: "0", DB: h.deps.db, R2: h.deps.bucket } as unknown as Env;
    const body = JSON.parse((await callTool("prepare_install", { package: "@alpha/demo", version: "1.0.0" }, { env })).content[0].text);
    refused(body, "not_found");
  });

  it("refuses an unpinned or malformed request as an argument error", async () => {
    for (const args of [
      { package: "@alpha/demo" },
      { package: "@alpha/demo", version: "1.0.0", host: "chatgpt" },
      { package: "@alpha/demo", version: "1.0.0", digest: "sha256:abc" },
    ]) {
      const { isError, body } = await prepare(args);
      expect(isError, JSON.stringify(args)).toBe(true);
      expect(body.details.code).toBe("invalid_arguments");
    }
  });
});
