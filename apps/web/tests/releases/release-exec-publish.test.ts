import { beforeEach, describe, expect, it } from "vitest";
import { createHarness, file, tarOf } from "./release-harness";

type Harness = Awaited<ReturnType<typeof createHarness>>;
let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

const exec = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify(
    {
      schemaVersion: "agentkit.skill-exec/v1",
      entrypoints: [
        {
          name: "run",
          path: "scripts/run.sh",
          interpreter: { name: "sh" },
          capabilities: {
            filesystem: { read: ["$PACKAGE"], write: ["$OUTPUT"] },
            network: { hosts: ["api.example.com"] },
            subprocess: false,
            env: [],
            secrets: ["API_TOKEN"],
            limits: { wallSeconds: 30, cpuSeconds: 30, memoryMiB: 256, processes: 4, outputBytes: 65536 },
          },
          ...overrides,
        },
      ],
    },
    null,
    2,
  );

const tree = (manifest: string) =>
  tarOf([
    file("SKILL.md", "---\nname: demo\ndescription: Demo skill\n---\n# Demo\n"),
    file("agentkit-exec.json", manifest),
    file("scripts/run.sh", "#!/bin/sh\necho ok\n", "100755"),
  ]);

const upload = (manifest: string, declaredScripts = ["scripts/run.sh"]) =>
  h.upload("@alpha/exec-demo", tree(manifest), { metadata: { version: "1.0.0", declaredScripts } });

const storedSummary = () =>
  (h.d1.raw.prepare("SELECT exec_summary_json FROM package_releases").get() as { exec_summary_json: string | null } | undefined)?.exec_summary_json;

describe("publish-time agentkit-exec.json validation", () => {
  it("accepts a valid manifest and stores its capability summary", async () => {
    const res = await upload(exec());
    expect(res.status).toBe(200);
    expect(res.body.warnings).toEqual([]);
    expect(res.body.exec).toMatchObject({
      validated: true,
      schemaVersion: "agentkit.skill-exec/v1",
      dependencies: { kind: "none" },
      entrypoints: [{ name: "run", path: "scripts/run.sh", networkHosts: ["api.example.com"], secrets: ["API_TOKEN"], subprocess: false }],
    });
    expect(res.body.exec.entrypoints[0].capabilityDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.parse(storedSummary()!)).toEqual(res.body.exec);
  });

  it("stores nothing for a tree without an exec manifest", async () => {
    const res = await h.upload("@alpha/plain", tarOf([file("SKILL.md", "---\nname: plain\ndescription: Plain\n---\n")]), { version: "1.0.0" });
    expect(res.status).toBe(200);
    expect(res.body.exec).toBeNull();
    expect(storedSummary()).toBeNull();
  });

  it("rejects a malformed manifest with 422 before storing anything", async () => {
    const res = await upload(exec({ interpreter: { name: "ruby" } }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("exec.manifest_invalid");
    expect(res.body.error.message).toContain("entrypoints[0].interpreter.name");
    expect(h.releaseRows()).toEqual([]);
    expect((await upload('{"schemaVersion":"agentkit.skill-exec/v1","schemaVersion":"x"}')).body.error.code).toBe("exec.manifest_invalid");
  });

  it("stores a newer schema major unvalidated, with a warning", async () => {
    const res = await upload(JSON.stringify({ schemaVersion: "agentkit.skill-exec/v2", entrypoints: "future shape" }));
    expect(res.status).toBe(200);
    expect(res.body.exec).toEqual({ validated: false, schema: "agentkit.skill-exec/v2", path: "agentkit-exec.json", fileDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });
    expect(res.body.warnings).toEqual([{ code: "exec.schema_unvalidated", message: expect.stringContaining("agentkit.skill-exec/v2") }]);
    expect(JSON.parse(storedSummary()!)).toEqual(res.body.exec);
  });

  it("rejects an entrypoint the publisher did not declare", async () => {
    const res = await upload(exec(), []);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("exec.entrypoint_undeclared");
    expect(h.releaseRows()).toEqual([]);
  });
});
