import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyReleaseManifest } from "@skillx/contracts";
import { readTarTree, treeDigest } from "@skillx/skill-tree";
import type { FileMode } from "@skillx/skill-tree";
import { packRelease } from "../../../../packages/cli/src/commands/release-pack";
import { loader as listLoader } from "~/routes/api.v1.package-releases";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { loader as fileLoader } from "~/routes/api.v1.release-file";
import { loader as artifactLoader } from "~/routes/api.v1.release-artifact";
import { FakeRateLimiter } from "../releases/fake-rate-limiter";
import { TEST_KEY_ID, createHarness } from "../releases/release-harness";

/**
 * End to end over the 94-file nested fixture (`tests/fixtures/full-tree-94`:
 * modules, binary assets, references, executable scripts): `skillx release
 * pack` from a real git commit -> publish -> list -> manifest -> every file ->
 * artifact, then the tree digest recomputed with `@skillx/skill-tree` from
 * the served bytes must equal the signed manifest's.
 *
 * Bindings: the Worker route modules run in-process over the release test
 * harness (a migrated node:sqlite D1 and an in-memory R2, the same fakes as
 * `tests/releases`), not a `wrangler dev` process; nothing remote is touched.
 *
 * Non-execution: every `node:child_process` entry point is spied on. Only the
 * pack step may spawn (`git`); from publish on, nothing may spawn, and the
 * fixture scripts, which write a marker file if ever run, leave no marker.
 */
const spawned = vi.hoisted(() => ({ calls: [] as Array<{ fn: string; command: string }> }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const names = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const;
  const wrapped = Object.fromEntries(
    names.map((name) => [
      name,
      (...args: unknown[]) => {
        spawned.calls.push({ fn: name, command: String(args[0]) });
        return (actual[name] as (...a: unknown[]) => unknown)(...args);
      },
    ]),
  );
  return { ...actual, ...wrapped, default: { ...actual, ...wrapped } };
});

const FIXTURE = fileURLToPath(new URL("../fixtures/full-tree-94", import.meta.url));
const FIXTURE_FILE_COUNT = 94;
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_AUTHOR_DATE: "2026-10-13T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-10-13T00:00:00Z",
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", ...args], { cwd, env: GIT_ENV, encoding: "utf8" });
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bytesOf = async (res: Response) => new Uint8Array(await res.arrayBuffer());
const isScript = (path: string) => /^scripts\/.+\.(?:sh|py)$/.test(path);

/** Fixture files by tree path ("/" separators), read from disk. */
function readFixture(dir: string, prefix = ""): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const path = `${prefix}${name}`;
    if (statSync(full).isDirectory()) for (const [p, b] of readFixture(full, `${path}/`)) out.set(p, b);
    else out.set(path, new Uint8Array(readFileSync(full)));
  }
  return out;
}

let root: string;
let skillDir: string;
let marker: string;
const previousMarker = process.env.SKILLX_FIXTURE_MARKER;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "skillx-e2e-"));
  marker = join(root, "fixture-script-ran.marker");
  // A fixture script that ever runs writes this file.
  process.env.SKILLX_FIXTURE_MARKER = marker;
  const repo = join(root, "repo");
  skillDir = join(repo, "skills", "full-tree-94");
  mkdirSync(repo);
  git(repo, "init", "-q");
  cpSync(FIXTURE, skillDir, { recursive: true });
  git(repo, "add", "-A");
  for (const path of readFixture(skillDir).keys()) {
    if (isScript(path)) git(repo, "update-index", "--chmod=+x", `skills/full-tree-94/${path}`);
  }
  git(repo, "commit", "-q", "-m", "fixture");
});

afterAll(() => {
  if (previousMarker === undefined) delete process.env.SKILLX_FIXTURE_MARKER;
  else process.env.SKILLX_FIXTURE_MARKER = previousMarker;
  rmSync(root, { recursive: true, force: true });
});

describe("release E2E: 94-file nested skill", () => {
  it("packs, publishes and reads back every file byte for byte, and the recomputed digest matches the manifest", async () => {
    const fixture = readFixture(FIXTURE);
    expect(fixture.size).toBe(FIXTURE_FILE_COUNT);
    for (const dir of ["modules/", "assets/", "references/", "scripts/"]) {
      expect([...fixture.keys()].some((p) => p.startsWith(dir) && p.split("/").length >= 3), dir).toBe(true);
    }

    // pack (the only step allowed to spawn: git)
    const packed = await packRelease(skillDir);
    expect(packed.fileCount).toBe(FIXTURE_FILE_COUNT);
    expect(new Set(spawned.calls.map((call) => call.command))).toEqual(new Set(["git"]));
    spawned.calls.length = 0;

    // publish
    const h = await createHarness();
    const scripts = [...fixture.keys()].filter(isScript).sort();
    const published = await h.upload("@alpha/full-tree", packed.tar, { metadata: { version: "1.0.0", declaredScripts: scripts } });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({
      created: true,
      state: "published",
      releaseDigest: packed.releaseDigest,
      artifactDigest: packed.artifactDigest,
      findings: [],
    });
    const digest = packed.releaseDigest;

    const env = { SKILLX_RELEASES_API: "1", DB: h.deps.db, R2: h.deps.bucket, RELEASE_READ_LIMITER: new FakeRateLimiter(10_000) };
    const get = (loader: typeof listLoader, path: string, params: Record<string, string>) =>
      loader({ request: new Request(`https://skillx.test${path}`), params, context: { cloudflare: { env } } } as never);

    // list
    const list = await get(listLoader, "/api/v1/packages/@alpha/full-tree/releases", { scope: "@alpha", slug: "full-tree" });
    expect(list.status).toBe(200);
    expect((await list.json()).releases).toEqual([
      expect.objectContaining({ version: "1.0.0", state: "published", releaseDigest: digest, artifactDigest: packed.artifactDigest }),
    ]);

    // manifest, by version and by digest: the same signed bytes
    const byVersion = await bytesOf(
      await get(manifestLoader, "/api/v1/packages/@alpha/full-tree/releases/1.0.0", { scope: "@alpha", slug: "full-tree", version: "1.0.0" }),
    );
    const byDigest = await bytesOf(await get(manifestLoader, `/api/v1/releases/${digest}/manifest`, { digest }));
    expect(byDigest).toEqual(byVersion);
    expect(await verifyReleaseManifest(byDigest, new Map([[TEST_KEY_ID, h.signingKey.publicKey]]))).toEqual({ valid: true, issues: [] });
    const manifest = JSON.parse(new TextDecoder().decode(byDigest)) as {
      releaseDigest: string;
      fileCount: number;
      files: Array<{ path: string; mode: FileMode; sha256: string; size: number }>;
    };
    expect(manifest.releaseDigest).toBe(digest);
    expect(manifest.fileCount).toBe(FIXTURE_FILE_COUNT);
    expect(manifest.files.map((f) => f.path).sort()).toEqual([...fixture.keys()].sort());

    // files: every manifest entry, byte-identical to the fixture, with its mode
    const served: Array<{ path: string; mode: FileMode; size: number; sha256: string }> = [];
    for (const entry of manifest.files) {
      const encoded = entry.path.split("/").map(encodeURIComponent).join("/");
      const res = await get(fileLoader, `/api/v1/releases/${digest}/files/${encoded}`, { digest, "*": entry.path });
      expect(res.status, entry.path).toBe(200);
      expect(res.headers.get("X-SkillX-File-Mode"), entry.path).toBe(isScript(entry.path) ? "100755" : "100644");
      const body = await bytesOf(res);
      expect(Buffer.from(body).equals(Buffer.from(fixture.get(entry.path)!)), entry.path).toBe(true);
      served.push({ path: entry.path, mode: res.headers.get("X-SkillX-File-Mode") as FileMode, size: body.length, sha256: sha(body) });
    }
    expect(served).toHaveLength(FIXTURE_FILE_COUNT);

    // artifact: the uploaded tar, which reads back to the same tree
    const artifact = await bytesOf(await get(artifactLoader, `/api/v1/releases/${digest}/artifact`, { digest }));
    expect(Buffer.from(artifact).equals(Buffer.from(packed.tar))).toBe(true);
    expect(`sha256:${sha(artifact)}`).toBe(packed.artifactDigest);

    // recompute with SX-1 (@skillx/skill-tree), from the served files and from the artifact
    expect(treeDigest(served)).toBe(manifest.releaseDigest);
    expect((await readTarTree(artifact, { compression: "none" })).digest).toBe(manifest.releaseDigest);

    // nothing was executed from publish on
    expect(spawned.calls).toEqual([]);
    expect(existsSync(marker)).toBe(false);
    expect((globalThis as Record<string, unknown>).__skillxFullTreeFixtureExecuted).toBeUndefined();
  }, 60_000);
});
