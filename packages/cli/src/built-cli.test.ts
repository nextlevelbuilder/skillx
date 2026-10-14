import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

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

describe("built cli", () => {
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
    const summary = JSON.parse(stdout) as { releaseDigest: string; artifactDigest: string; fileCount: number };
    expect(summary.releaseDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(summary.fileCount).toBe(2);
    expect(`sha256:${createHash("sha256").update(readFileSync(out)).digest("hex")}`).toBe(summary.artifactDigest);
  });

  it("publishes a release to a loopback stub registry", async () => {
    const packDigest = (JSON.parse((await cli("release", "pack", skillDir, "--out", join(root, "pub.tar"), "--json")).stdout) as { releaseDigest: string }).releaseDigest;
    const received: { url?: string; auth?: string; type?: string; digest?: string } = {};
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
        "release", "publish", skillDir,
        "--name", "@smoke/smoke-skill",
        "--release-version", "1.0.0",
        "--repo", "https://github.com/example/smoke",
        "--registry", `http://127.0.0.1:${port}`,
        "--json",
      );
      const result = JSON.parse(stdout) as { releaseDigest: string; artifactDigest: string; state: string };
      expect(result).toMatchObject({ releaseDigest: packDigest, artifactDigest: received.digest, state: "published" });
      expect(received).toMatchObject({ url: "/api/v1/packages/@smoke/smoke-skill/releases", auth: "Bearer sx_test_smoke_key", type: "application/x-tar" });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
