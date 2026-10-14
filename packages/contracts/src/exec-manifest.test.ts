import { describe, expect, it } from "vitest";
import { EXEC_MANIFEST_MAX_BYTES, execCapabilityDigest, validateExecManifest } from "./exec-manifest";
import type { ExecManifest, ExecManifestTree } from "./exec-manifest";
import { summarizeExecManifest } from "./exec-summary";
import { parseStrictJson } from "./strict-json";

const encoder = new TextEncoder();
const TREE: ExecManifestTree = {
  files: new Set(["SKILL.md", "agentkit-exec.json", "scripts/render.py", "scripts/extra.sh", "requirements.lock"]),
  declaredScripts: ["scripts/render.py"],
};

function validManifest(): Record<string, any> {
  return {
    schemaVersion: "agentkit.skill-exec/v1",
    entrypoints: [
      {
        name: "render",
        path: "scripts/render.py",
        interpreter: { name: "python3", version: ">=3.10.0" },
        args: { maxCount: 8, maxBytes: 4096 },
        inputs: ["source"],
        capabilities: {
          filesystem: { read: ["$PACKAGE", "$INPUT:source"], write: ["$OUTPUT", "$TMP"] },
          network: { hosts: [] },
          subprocess: false,
          env: ["LANG"],
          secrets: [],
          limits: { wallSeconds: 60, cpuSeconds: 30, memoryMiB: 512, processes: 1, outputBytes: 1048576 },
        },
      },
    ],
    dependencies: { kind: "none" },
  };
}

function check(doc: unknown, tree = TREE) {
  return validateExecManifest(encoder.encode(typeof doc === "string" ? doc : JSON.stringify(doc, null, 2)), tree);
}

function mutate(fn: (doc: Record<string, any>) => void) {
  const doc = validManifest();
  fn(doc);
  return check(doc);
}

describe("strict JSON", () => {
  it("rejects duplicate members at any depth and a BOM", () => {
    expect(parseStrictJson('{"a":1,"a":2}')).toEqual({ ok: false, reason: "repeats the member a" });
    expect(parseStrictJson('{"a":[{"b":1,"c":{"d":1,"d":2}}]}')).toMatchObject({ ok: false, reason: expect.stringContaining("d") });
    expect(parseStrictJson('{"a":{"x":1},"b":{"x":1}}').ok).toBe(true);
    expect(parseStrictJson('{"k":"a\\"b","k2":"a,b{"}').ok).toBe(true);
    expect(parseStrictJson(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])).ok).toBe(false);
    expect(parseStrictJson(new Uint8Array([0xff])).ok).toBe(false);
  });
});

describe("validateExecManifest", () => {
  it("accepts a well-formed manifest, including G3 v1 capabilities", () => {
    expect(check(validManifest()).ok).toBe(true);
    const wide = mutate((d) => {
      const caps = d.entrypoints[0].capabilities;
      caps.network.hosts = ["api.example.com", "pypi.org"];
      caps.subprocess = true;
      caps.secrets = ["OPENAI_API_KEY"];
      d.dependencies = { kind: "python-lock", lockfile: "requirements.lock" };
    });
    expect(wide.ok).toBe(true);
  });

  it.each([
    ["unknown top-level field", (d: any) => (d.extra = 1), "extra"],
    ["unknown capability field", (d: any) => (d.entrypoints[0].capabilities.gpu = true), "entrypoints[0].capabilities.gpu"],
    ["interpreter not allowlisted", (d: any) => (d.entrypoints[0].interpreter.name = "ruby"), "entrypoints[0].interpreter.name"],
    ["bad version range", (d: any) => (d.entrypoints[0].interpreter.version = "^3.10"), "entrypoints[0].interpreter.version"],
    ["limit above ceiling", (d: any) => (d.entrypoints[0].capabilities.limits.wallSeconds = 3601), "entrypoints[0].capabilities.limits.wallSeconds"],
    ["missing limit", (d: any) => delete d.entrypoints[0].capabilities.limits.processes, "entrypoints[0].capabilities.limits.processes"],
    ["host absolute path root", (d: any) => (d.entrypoints[0].capabilities.filesystem.write = ["/tmp"]), "entrypoints[0].capabilities.filesystem.write[0]"],
    ["undeclared input root", (d: any) => (d.entrypoints[0].capabilities.filesystem.read = ["$INPUT:other"]), "entrypoints[0].capabilities.filesystem.read[0]"],
    ["IP or wildcard host", (d: any) => (d.entrypoints[0].capabilities.network.hosts = ["*.example.com"]), "entrypoints[0].capabilities.network.hosts[0]"],
    ["lower-case secret name", (d: any) => (d.entrypoints[0].capabilities.secrets = ["token"]), "entrypoints[0].capabilities.secrets[0]"],
    ["entrypoint outside the tree", (d: any) => (d.entrypoints[0].path = "../evil.py"), "entrypoints[0].path"],
    ["duplicate entrypoint name", (d: any) => d.entrypoints.push(structuredClone(d.entrypoints[0])), "entrypoints[1].name"],
    ["lockfile missing", (d: any) => (d.dependencies = { kind: "node-lock", lockfile: "pnpm-lock.yaml" }), "dependencies.lockfile"],
    ["unknown dependency kind", (d: any) => (d.dependencies = { kind: "pip" }), "dependencies.kind"],
    ["arg cap above ceiling", (d: any) => (d.entrypoints[0].args.maxCount = 65), "entrypoints[0].args.maxCount"],
    ["empty entrypoints", (d: any) => (d.entrypoints = []), "entrypoints"],
  ])("rejects %s", (_label, fn, path) => {
    const result = mutate(fn);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("exec.manifest_invalid");
      expect(result.issues.map((i) => i.path)).toContain(path);
    }
  });

  it("rejects an entrypoint missing from declaredScripts with its own code", () => {
    const result = mutate((d) => (d.entrypoints[0].path = "scripts/extra.sh"));
    expect(result).toMatchObject({ ok: false, code: "exec.entrypoint_undeclared" });
  });

  it("rejects syntax, duplicates, oversize and other schema majors", () => {
    expect(check("{not json")).toMatchObject({ ok: false, code: "exec.manifest_invalid" });
    const dup = JSON.stringify(validManifest()).replace('"schemaVersion"', '"entrypoints":[],"schemaVersion"');
    expect(check(dup)).toMatchObject({ ok: false, issues: [{ code: "syntax" }] });
    const big = validateExecManifest(new Uint8Array(EXEC_MANIFEST_MAX_BYTES + 1), TREE);
    expect(big).toMatchObject({ ok: false, issues: [{ code: "max_bytes" }] });
    expect(mutate((d) => (d.schemaVersion = "agentkit.skill-exec/v2"))).toMatchObject({ ok: false, issues: [{ code: "unsupported_version" }] });
  });
});

describe("capability digest and summary", () => {
  it("is invariant to key order and whitespace and changes when capabilities grow", async () => {
    const a = check(validManifest());
    const reordered = JSON.parse(JSON.stringify(validManifest(), Object.keys(validManifest()).reverse()));
    const b = check(JSON.stringify({ ...reordered, ...validManifest() }));
    if (!a.ok || !b.ok) throw new Error("fixtures must validate");
    const digestA = await execCapabilityDigest(a.manifest.entrypoints[0]!);
    expect(await execCapabilityDigest(b.manifest.entrypoints[0]!)).toBe(digestA);
    const grown = structuredClone(a.manifest) as ExecManifest;
    grown.entrypoints[0]!.capabilities.network.hosts = ["api.example.com"];
    expect(await execCapabilityDigest(grown.entrypoints[0]!)).not.toBe(digestA);
    expect(digestA).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("summarizes requested capabilities per entrypoint", async () => {
    const bytes = encoder.encode(JSON.stringify(validManifest()));
    const result = validateExecManifest(bytes, TREE);
    if (!result.ok) throw new Error("fixture must validate");
    const summary = await summarizeExecManifest(result.manifest, bytes);
    expect(summary).toMatchObject({
      schemaVersion: "agentkit.skill-exec/v1",
      path: "agentkit-exec.json",
      dependencies: { kind: "none" },
      entrypoints: [{ name: "render", path: "scripts/render.py", networkHosts: [], subprocess: false, secrets: [], write: ["$OUTPUT", "$TMP"] }],
    });
    expect(summary.fileDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
