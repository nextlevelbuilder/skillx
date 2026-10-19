import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync, execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { COMPATIBILITY_STATUSES, isCompatibilityActionable } from "@skillx/contracts";

/**
 * Smoke tests of the built CLI, run exactly the way the release ships it: `pnpm build` (tsup) and
 * then `bin/skillx.js` under Node, never the TypeScript source.
 *
 * Issue #24: the binary reported a hardcoded version that had drifted from package.json.
 * Issue #73: tsup bundled the CommonJS `yaml` package (pulled in through `@skillx/skill-tree`)
 * into the ESM bundle, and its `require("process")` threw "Dynamic require ... is not supported"
 * at startup, so every command failed, `release publish` included. `yaml` is now a runtime
 * dependency, which keeps it external.
 */
const CLI_DIR = fileURLToPath(new URL("..", import.meta.url));
const BIN = join(CLI_DIR, "bin", "skillx.js");
const BUNDLE = join(CLI_DIR, "dist", "index.js");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
const MANIFEST = readJson(join(CLI_DIR, "package.json"));
const execFileAsync = promisify(execFile);

let root: string;
let skillDir: string;
let childEnv: NodeJS.ProcessEnv;

/** Runs the built CLI asynchronously so an in-process stub registry can answer it. */
async function cli(...args: string[]) {
  return execFileAsync(process.execPath, [BIN, ...args], { cwd: root, env: childEnv, encoding: "utf8" });
}

/** Runs the built CLI and keeps a non-zero exit as data, since exit codes are part of the contract. */
async function cliExit(...args: string[]): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await cli(...args);
    return { code: 0, stdout };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string };
    return { code: failed.code ?? -1, stdout: failed.stdout ?? "" };
  }
}

/** Runs the built CLI with `input` on stdin, then closes it; the exit code is data. */
function cliWithInput(input: string, ...args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd: root, env: childEnv });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout }));
    child.stdin.end(input);
  });
}

beforeAll(() => {
  // Through a shell: on Windows pnpm is a .cmd shim that execFile cannot start directly.
  execSync("pnpm build", { cwd: CLI_DIR, stdio: "pipe" });

  root = mkdtempSync(join(tmpdir(), "skillx-built-cli-"));
  // Keep the CLI's config store (conf) out of the real user profile.
  const configHome = join(root, "config");
  childEnv = { ...process.env, XDG_CONFIG_HOME: configHome, APPDATA: configHome, LOCALAPPDATA: configHome, SKILLX_API_KEY: "sx_test_smoke_key" };
  skillDir = join(root, "repo");
  mkdirSync(join(skillDir, "references"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: smoke-skill\ndescription: Built CLI smoke\nuser-invocable: true\n---\n# Smoke\n");
  writeFileSync(join(skillDir, "references", "notes.md"), "notes\n");
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { cwd: skillDir, stdio: "pipe" });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "smoke");
}, 240_000);

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

// Each case spawns Node one or more times; under a full parallel run that can pass the 5s default.
describe("built cli", { timeout: 30_000 }, () => {
  it("keeps the runtime dependencies of bundled workspace packages external", () => {
    const bundledDeps = Object.keys(readJson(join(CLI_DIR, "..", "skill-tree", "package.json")).dependencies ?? {});
    expect(Object.keys(MANIFEST.dependencies)).toEqual(expect.arrayContaining(bundledDeps));
    // esbuild's CommonJS shim throws in ESM; no bundled module may reach it.
    expect(readFileSync(BUNDLE, "utf8")).not.toMatch(/__require\(/);
  });

  it("reports the version declared in package.json", async () => {
    const { stdout } = await cli("--version");
    expect(stdout.trim()).toBe(MANIFEST.version);
  });

  it("prints --help", async () => {
    const { stdout } = await cli("--help");
    expect(stdout).toContain("Usage: skillx");
    expect(stdout).toContain("release");
    expect((await cli("release", "publish", "--help")).stdout).toContain("--release-version");
  });

  it("packs a skill with YAML frontmatter through the skill-tree reader", async () => {
    const out = join(root, "smoke.tar");
    const { stdout } = await cli("release", "pack", skillDir, "--out", out, "--json");
    const summary = (JSON.parse(stdout) as { ok: true; data: { releaseDigest: string; artifactDigest: string; fileCount: number } }).data;
    expect(summary.releaseDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(summary.fileCount).toBe(2);
    expect(`sha256:${createHash("sha256").update(readFileSync(out)).digest("hex")}`).toBe(summary.artifactDigest);
  });

  it("publishes a release to a loopback stub registry", async () => {
    const packDigest = (JSON.parse((await cli("pack", skillDir, "--out", join(root, "pub.tar"), "--json")).stdout) as { data: { releaseDigest: string } }).data.releaseDigest;
    const received: { url?: string; auth?: string; type?: string; digest?: string; idempotency?: string } = {};
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        Object.assign(received, {
          url: req.url,
          auth: req.headers.authorization,
          type: req.headers["content-type"],
          digest: `sha256:${createHash("sha256").update(body).digest("hex")}`,
          idempotency: req.headers["idempotency-key"],
        });
        const meta = JSON.parse(Buffer.from(String(req.headers["x-skillx-release"]), "base64").toString("utf8")) as { version: string };
        res.writeHead(201, { "Content-Type": "application/json" });
        // The stub cannot recompute the tree digest; it echoes the one the pack test asserts on.
        res.end(JSON.stringify({ created: true, state: "published", version: meta.version, artifactDigest: received.digest, releaseDigest: packDigest }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const { stdout } = await cli(
        "publish", skillDir,
        "--name", "@smoke/smoke-skill",
        "--release-version", "1.0.0",
        "--repo", "https://github.com/example/smoke",
        "--registry", `http://127.0.0.1:${port}`,
        "--idempotency-key", "smoke-run-1",
        "--json",
      );
      const result = (JSON.parse(stdout) as { ok: true; data: { releaseDigest: string; artifactDigest: string; state: string } }).data;
      expect(result).toMatchObject({ releaseDigest: packDigest, artifactDigest: received.digest, state: "published" });
      expect(received).toMatchObject({ url: "/api/v1/packages/@smoke/smoke-skill/releases", auth: "Bearer sx_test_smoke_key", type: "application/x-tar", idempotency: "smoke-run-1" });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("validates and packs the same tree to the same digest on every run", async () => {
    const runs = [];
    for (const i of [1, 2]) {
      const validated = JSON.parse((await cli("validate", skillDir, "--name", "@smoke/smoke-skill", "--release-version", "1.0.0", "--json")).stdout);
      const packed = JSON.parse((await cli("pack", skillDir, "--out", join(root, `twice-${i}.tar`), "--json")).stdout);
      expect(validated).toMatchObject({ ok: true, data: { valid: true, skill: { name: "smoke-skill" } } });
      runs.push([validated.data.releaseDigest, packed.data.releaseDigest, packed.data.artifactDigest]);
    }
    expect(runs[0][0]).toBe(runs[0][1]);
    expect(runs[1]).toEqual(runs[0]);
    expect(readFileSync(join(root, "twice-1.tar"))).toEqual(readFileSync(join(root, "twice-2.tar")));
  });

  it("answers usage (2) and auth (5) failures with an envelope and exit code", async () => {
    const bad = await cli("validate", skillDir, "--release-version", "v1", "--json").catch((e) => e);
    expect(bad.code).toBe(2);
    expect(JSON.parse(bad.stdout)).toMatchObject({ ok: false, error: { code: "usage_error" } });
    const noKey = await execFileAsync(process.execPath, [BIN, "publish", skillDir, "--name", "@smoke/s", "--release-version", "1.0.0", "--registry", "http://127.0.0.1:9", "--json"], {
      cwd: root,
      env: { ...childEnv, SKILLX_API_KEY: "" },
      encoding: "utf8",
    }).catch((e) => e);
    expect(noKey.code).toBe(5);
    expect(JSON.parse(noKey.stdout).error.code).toBe("auth_error");
  });

  it("keeps `publish owner/repo` as a deprecated import and exposes the aliases", async () => {
    const { stdout, stderr } = await cli("publish", "example/smoke", "--dry-run");
    expect(stderr).toContain("deprecated");
    expect(stderr).toContain("skillx import");
    expect(stdout).toContain("example/smoke");
    expect((await cli("import", "example/smoke", "--dry-run")).stderr).not.toContain("deprecated");
    const help = (await cli("--help")).stdout;
    for (const command of ["import", "validate", "pack", "publish", "promote", "release"]) expect(help).toContain(command);
    expect((await cli("promote", "--help")).stdout).toContain("--to <channel>");
  });

  it("inlines @skillx/contracts instead of leaving a workspace import", () => {
    const bundle = readFileSync(BUNDLE, "utf8");
    expect(bundle).not.toMatch(/["']@skillx\//);
    expect(bundle).toContain("isCompatibilityActionable");
  });

  it("answers check --json for all five statuses with the contract's decision and exit code", async () => {
    const server = createServer((req, res) => {
      const url = new URL(String(req.url), "http://stub");
      if (url.pathname === "/api/search") {
        // One hit for "one hit", none for anything else.
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const hit = { slug: "s-declared", name: "s-declared", author: "a", category: "c", description: "d" };
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ results: body.includes("one hit") ? [hit] : [] }));
        });
        return;
      }
      const status = url.pathname.replace("/api/skills/s-", "");
      if (!(COMPATIBILITY_STATUSES as readonly string[]).includes(status)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      const target = { runtime: "agentkit", status, versions: null, scopes: [], requirements: [], evidence: null, reasons: [] };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ skill: { slug: `s-${status}` }, compatibility: { declared: [], target } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const setUrl = await cliExit("config", "set-url", `http://127.0.0.1:${port}`, "--json");
      expect(setUrl.code).toBe(0);
      expect(JSON.parse(setUrl.stdout)).toEqual({ ok: true, data: { baseUrl: `http://127.0.0.1:${port}` } });

      for (const status of COMPATIBILITY_STATUSES) {
        const { code, stdout } = await cliExit("check", `s-${status}`, "--target", "agentkit@1.2.0", "--json");
        const envelope = JSON.parse(stdout) as { ok: boolean; data: { status: string; actionable: boolean } };
        const actionable = isCompatibilityActionable(status);
        expect(envelope).toMatchObject({ ok: true, data: { status, actionable } });
        expect(code).toBe(actionable ? 0 : 4);
      }

      const missing = await cliExit("check", "s-nope", "--target", "agentkit", "--json");
      expect(missing.code).toBe(3);
      expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false, error: { code: "not_found" } });

      const nothing = await cliExit("use", "no such skill anywhere", "--json");
      expect(nothing.code).toBe(3);
      expect(JSON.parse(nothing.stdout)).toMatchObject({ ok: false, error: { code: "not_found" } });

      // A prompt on a closed stdin is a usage error, not a hang or Node's exit 13.
      const noPick = await cliWithInput("", "find", "one hit");
      expect(noPick.code).toBe(2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("reports a parse error as usage_error with exit 2", async () => {
    const { code, stdout } = await cliExit("check", "some-skill", "--json");
    expect(code).toBe(2);
    expect(JSON.parse(stdout)).toMatchObject({ ok: false, error: { code: "usage_error" } });
  });

  it.each([["help", "check"], ["help", "check", "--json"], ["check", "--help", "--json"]])(
    "treats `%s %s` as help, exit 0, with no usage_error envelope",
    async (...args) => {
      const { code, stdout } = await cliExit(...args);
      expect(code).toBe(0);
      expect(stdout).toContain("Usage: skillx check");
      expect(stdout).not.toContain("usage_error");
    },
  );

  it("reports a missing command as usage_error with exit 2", async () => {
    expect((await cliExit()).code).toBe(2);
    expect((await cliExit("config")).code).toBe(2);
  });

  it("reads --json only before --", async () => {
    const { code, stdout } = await cliExit("check", "--", "--json");
    expect(code).toBe(2);
    expect(stdout).not.toContain("usage_error");
  });

  it.each([[""], ["   \n"]])("refuses config set-key --json with no key on stdin (%j) as usage_error", async (input) => {
    const { code, stdout } = await cliWithInput(input, "config", "set-key", "--json");
    expect(code).toBe(2);
    expect(JSON.parse(stdout)).toMatchObject({ ok: false, error: { code: "usage_error" } });
  });

  it("validates report arguments before any request", async () => {
    const { code, stdout } = await cliExit("report", "some-skill", "maybe", "--json");
    expect(code).toBe(2);
    expect(JSON.parse(stdout)).toMatchObject({ ok: false, error: { code: "usage_error", details: { outcome: "maybe" } } });
  });

  it("shows config as an envelope without the full key", async () => {
    const { code, stdout } = await cliExit("config", "show", "--json");
    const envelope = JSON.parse(stdout) as { ok: boolean; data: { apiKey: { configured: boolean; source: string; masked: string } } };
    expect(code).toBe(0);
    expect(envelope.data.apiKey).toMatchObject({ configured: true, source: "env" });
    expect(stdout).not.toContain("sx_test_smoke_key");
  });
});
