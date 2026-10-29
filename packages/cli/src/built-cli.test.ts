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
    for (const command of [["publish"], ["release", "publish"]]) expect((await cli(...command, "--help")).stdout).toContain("--visibility <visibility>");
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
    const received: { url?: string; auth?: string; type?: string; digest?: string; idempotency?: string; visibility?: string } = {};
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
        const meta = JSON.parse(Buffer.from(String(req.headers["x-skillx-release"]), "base64").toString("utf8")) as { version: string; visibility?: string };
        received.visibility = meta.visibility;
        res.writeHead(201, { "Content-Type": "application/json" });
        // The stub cannot recompute the tree digest; it echoes the one the pack test asserts on. Like a new package, it defaults to private.
        const visibility = meta.visibility ?? "private";
        res.end(JSON.stringify({ created: true, state: "published", version: meta.version, visibility, artifactDigest: received.digest, releaseDigest: packDigest }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const publish = (...extra: string[]) =>
        cli(
          "publish", skillDir,
          "--name", "@smoke/smoke-skill",
          "--release-version", "1.0.0",
          "--repo", "https://github.com/example/smoke",
          "--registry", `http://127.0.0.1:${port}`,
          "--idempotency-key", "smoke-run-1",
          "--json",
          ...extra,
        );
      const { stdout, stderr } = await publish();
      const result = (JSON.parse(stdout) as { ok: true; data: { releaseDigest: string; artifactDigest: string; state: string } }).data;
      expect(result).toMatchObject({ releaseDigest: packDigest, artifactDigest: received.digest, state: "published", visibility: "private" });
      expect(received).toMatchObject({ url: "/api/v1/packages/@smoke/smoke-skill/releases", auth: "Bearer sx_test_smoke_key", type: "application/x-tar", idempotency: "smoke-run-1" });
      // Omitted flag: nothing sent, and the private default is noted on stderr only, never in the JSON stdout.
      expect(received.visibility).toBeUndefined();
      expect(stderr).toContain("note: @smoke/smoke-skill is private");

      const explicit = await publish("--visibility", "public");
      expect(JSON.parse(explicit.stdout)).toMatchObject({ ok: true, data: { visibility: "public" } });
      expect(received.visibility).toBe("public");
      expect(explicit.stderr).not.toContain("note:");

      const bad = await publish("--visibility", "unlisted").catch((e) => e);
      expect(bad.code).toBe(2);
      expect(JSON.parse(bad.stdout)).toMatchObject({ ok: false, error: { code: "usage_error", message: expect.stringContaining("--visibility") } });
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

  it("refuses --visibility on the deprecated import path (exit 2) and sends nothing", async () => {
    const requests: string[] = [];
    const server = createServer((req, res) => {
      requests.push(`${req.method} ${req.url}`);
      req.resume();
      res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const registry = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      // The import reads the configured base URL, not --registry; point both at the stub.
      expect((await cliExit("config", "set-url", registry, "--json")).code).toBe(0);
      for (const args of [
        ["publish", "example/smoke", "--visibility", "private"],
        ["publish", "https://github.com/example/smoke", "--visibility", "public"],
        ["publish", "--visibility", "private"],
      ]) {
        const result = await cliExit(...args, "--registry", registry, "--json");
        expect(result.code, args.join(" ")).toBe(2);
        expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { code: "usage_error", message: expect.stringContaining("--visibility applies only to release publishing") } });
      }
      expect(requests).toEqual([]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("lists the library across pages and drives kit push/activate with machine-readable failures", async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        seen.push(`${req.method} ${req.url} ${req.headers["if-match"] ?? ""}`.trim());
        const url = new URL(String(req.url), "http://stub");
        const send = (status: number, body: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
        if (url.pathname === "/api/v1/library") {
          const item = (identity: string) => ({ kind: "skill", identity, relation: "owner", visibility: "private", packageKind: "skill", state: "published", latest: { version: "1.0.0", releaseDigest: "sha256:aa" }, installRef: `${identity}@1.0.0` });
          const first = url.searchParams.get("cursor") === null;
          return send(200, { schema: "skillx.library/v1", items: [item(first ? "@a/one" : "@a/two")], nextCursor: first ? "c1" : null, kits: { status: "available" } });
        }
        if (url.pathname.endsWith("/revisions") && req.method === "POST") return send(412, { error: { code: "kit.generation_conflict", message: "generation is 4" } });
        send(404, { error: { code: "kit.not_found", message: "no such kit" } });
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      expect((await cliExit("config", "set-url", `http://127.0.0.1:${(server.address() as AddressInfo).port}`, "--json")).code).toBe(0);
      const listed = await cliExit("library", "list", "--kind", "skill", "--json");
      expect(listed.code).toBe(0);
      expect(JSON.parse(listed.stdout)).toMatchObject({ ok: true, data: { items: [{ identity: "@a/one" }, { identity: "@a/two" }], nextCursor: null } });
      expect(seen.slice(0, 2)).toEqual(["GET /api/v1/library?kind=skill", "GET /api/v1/library?kind=skill&cursor=c1"]);

      const doc = join(root, "kit-doc.json");
      writeFileSync(doc, JSON.stringify({ schema: "skillx.personal-kit/v1" }));
      const stale = await cliExit("kit", "push", "@alpha/my-kit", "--document", doc, "--if-match", "1", "--json");
      expect(stale.code).toBe(8);
      expect(JSON.parse(stale.stdout)).toMatchObject({ ok: false, error: { code: "conflict", details: { status: 412, code: "kit.generation_conflict" } } });
      expect(seen.at(-1)).toBe('POST /api/v1/kits/@alpha/my-kit/revisions "g1"');

      const missing = await cliExit("kit", "show", "@alpha/none", "--json");
      expect(missing.code).toBe(3);
      expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false, error: { code: "not_found", details: { code: "kit.not_found" } } });

      const before = seen.length;
      const noDigest = await cliExit("kit", "activate", "@alpha/my-kit", "pkr_1", "--json");
      expect(noDigest.code).toBe(2);
      expect(JSON.parse(noDigest.stdout)).toMatchObject({ ok: false, error: { code: "usage_error" } });
      expect(seen.length).toBe(before);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
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

      // A piped selection without a trailing newline still selects.
      const picked = await cliWithInput("1", "find", "one hit");
      expect(picked.code).toBe(0);
      expect(picked.stdout).toContain("s-declared");
      expect(picked.stdout).not.toContain("Cancelled");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  /** Leaf commands from `--help`, walked recursively (`config set-key`, `release pack`, ...). */
  async function leafCommands(path: string[] = []): Promise<string[][]> {
    const help = (await cli(...path, "--help")).stdout;
    const section = help.split(/^Commands:$/m)[1];
    if (section === undefined) return [path];
    const names = [...section.matchAll(/^  (\S+)/gm)].map((m) => m[1]!).filter((name) => name !== "help");
    return (await Promise.all(names.map((name) => leafCommands([...path, name])))).flat();
  }

  it("add installs a local skill through the installer as one envelope, with installer exit codes", async () => {
    const home = join(root, "add-home");
    const env = { ...childEnv, HOME: home, USERPROFILE: home, SKILLX_HOME: join(home, ".skillx"), CLAUDE_CONFIG_DIR: join(home, ".claude") };
    const run = async (...args: string[]) => {
      try {
        return { code: 0, stdout: (await execFileAsync(process.execPath, [BIN, ...args], { cwd: root, env, encoding: "utf8" })).stdout };
      } catch (error) {
        const failed = error as { code?: number; stdout?: string };
        return { code: failed.code ?? -1, stdout: failed.stdout ?? "" };
      }
    };
    const src = join(root, "add-src");
    mkdirSync(join(src, "references"), { recursive: true });
    writeFileSync(join(src, "SKILL.md"), "---\nname: smoke-skill\ndescription: Built CLI smoke\n---\n# Smoke\n");
    writeFileSync(join(src, "references", "notes.md"), "notes\n");
    const listed = JSON.parse((await run("add", src, "--list", "--json")).stdout) as { ok: true; data: { status: string; skills: Array<{ name: string }> } };
    expect(listed.data).toMatchObject({ status: "listed", skills: [{ name: "smoke-skill" }] });

    const installed = await run("add", src, "--json");
    expect(installed.code).toBe(0);
    expect(JSON.parse(installed.stdout)).toMatchObject({ ok: true, data: { status: "installed", skills: [{ alias: "smoke-skill" }] } });
    expect(readFileSync(join(home, ".claude", "skills", "smoke-skill", "references", "notes.md"), "utf8")).toBe("notes\n");
    const owners = JSON.parse((await run("list", "--json")).stdout) as { data: { sources: Array<{ owner: string }> } };
    expect(owners.data.sources.map((s) => s.owner)).toEqual(["add:smoke-skill"]);

    // The same name from a changed tree is a conflict (exit 8) until --force.
    writeFileSync(join(src, "SKILL.md"), "---\nname: smoke-skill\ndescription: Built CLI smoke v2\n---\n");
    const conflict = await run("add", src, "--json");
    expect(conflict.code).toBe(8);
    expect(JSON.parse(conflict.stdout)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect((await run("add", src, "--force", "--json")).code).toBe(0);
    expect((await run("uninstall", "add:smoke-skill", "--json")).code).toBe(0);

    const missing = await run("add", join(root, "no-such-dir"), "--json");
    expect(missing.code).toBe(2);
    expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false, error: { code: "usage_error" } });
    // Human mode fails and exits too; nothing keeps the process alive.
    expect((await run("add", "ext::sh -c id")).code).toBe(2);
    const token = "ghp_SECRETTOKEN123";
    const leaked = await run("add", `http://user:${token}@127.0.0.1:9/x.git`, "--json");
    expect(leaked.code).toBe(2);
    expect(leaked.stdout).not.toContain(token);
  });

  it("offers --json on every command but the stdio MCP server", async () => {
    const leaves = await leafCommands();
    expect(leaves.length).toBeGreaterThan(20);
    const missing = [];
    for (const leaf of leaves) {
      if (leaf.join(" ") === "mcp") continue; // speaks MCP on stdio; there is no single result to wrap
      if (!(await cli(...leaf, "--help")).stdout.includes("--json")) missing.push(leaf.join(" "));
    }
    expect(missing).toEqual([]);
  });

  it.each([
    [["install", "notaref"], "usage_error", 2],
    [["list", "--runtime", "zzz"], "usage_error", 2],
    [["validate", "./nope"], "usage_error", 2],
    [["pack", "./nope", "--out", "x.tar"], "usage_error", 2],
    [["promote", "bad", "--to", "stable"], "usage_error", 2],
    [["import", "not-a-repo"], "usage_error", 2],
  ])("answers a failing `%s` with one %s envelope and exit %i", async (args, code, exit) => {
    const result = await cliExit(...args, "--json");
    expect(result.code).toBe(exit);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { code } });
  });

  it("names the command that could not pack the source", async () => {
    for (const [command, extra] of [["validate", []], ["pack", ["--out", "x.tar"]]] as const) {
      const { stdout } = await cliExit(command, "./nope", ...extra, "--json");
      expect(JSON.parse(stdout).error.message).toMatch(new RegExp(`^cannot ${command} \\./nope:`));
    }
  });

  it("answers a registry 429 as rate_limited (exit 7) on install and promote alike", async () => {
    const server = createServer((req, res) => {
      req.resume();
      res.writeHead(429, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { code: "rate_limited", message: "slow down" } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const registry = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      for (const args of [["install", "@alpha/demo", "--runtime", "claude-code"], ["promote", "@alpha/demo@1.0.0", "--to", "stable"]]) {
        const result = await cliExit(...args, "--registry", registry, "--json");
        expect(result.code).toBe(7);
        expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { code: "rate_limited" } });
      }
    } finally {
      server.close();
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

  it.each([["unterminated", "pk_unterminated_9z"], ["newline-terminated", "pk_terminated_9z\n"]])(
    "saves a %s key piped into config set-key --json",
    async (_label, input) => {
      const { code, stdout } = await cliWithInput(input, "config", "set-key", "--json");
      const envelope = JSON.parse(stdout) as { ok: boolean; data: { saved: boolean; path: string } };
      expect(code).toBe(0);
      expect(envelope).toMatchObject({ ok: true, data: { saved: true } });
      expect(stdout).not.toContain(input.trim());
      expect(readJson(envelope.data.path).apiKey).toBe(input.trim());
    },
  );

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
