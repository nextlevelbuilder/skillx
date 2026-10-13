#!/usr/bin/env node
/**
 * Local smoke test of the release publish and pinned read API.
 *
 * LOCAL ONLY. It talks to a dev server on a loopback address and seeds the
 * LOCAL D1 through `wrangler d1 execute --local`; it never deploys and never
 * touches remote D1, R2 or KV (every wrangler call carries `--local`, and a
 * non-loopback base URL is refused).
 *
 * Setup:
 *   1. pnpm --filter web db:migrate                 (applies migrations to the local D1)
 *   2. node scripts/smoke-releases-local.mjs --print-dev-vars >> apps/web/.dev.vars
 *      (a throwaway Ed25519 key plus SKILLX_RELEASES_API=1; .dev.vars is local and git-ignored)
 *   3. pnpm dev                                     (local bindings via the Cloudflare Vite plugin)
 *   4. node scripts/smoke-releases-local.mjs [--base http://localhost:5173]
 *
 * Exit code 0 when every check passes, 1 otherwise.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_DIR = fileURLToPath(new URL("../apps/web/", import.meta.url));
const DEV_VARS = join(WEB_DIR, ".dev.vars");
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

const args = process.argv.slice(2);
if (args.includes("--print-dev-vars")) {
  const { privateKey } = generateKeyPairSync("ed25519");
  const der = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  console.log(`SKILLX_RELEASES_API=1\nSKILLX_REGISTRY_SIGNING_KEY=${der}\nSKILLX_REGISTRY_SIGNING_KEY_ID=skillx-reg-local-smoke`);
  process.exit(0);
}
const baseIndex = args.indexOf("--base");
const BASE = new URL(baseIndex >= 0 ? args[baseIndex + 1] : "http://localhost:5173");
if (!LOOPBACK.has(BASE.hostname)) {
  console.error(`refusing non-loopback base URL ${BASE.origin}: this smoke test is local only`);
  process.exit(1);
}

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || detail === "" ? "" : `: ${detail}`}`);
  if (!ok) failures++;
}

function readDevVars() {
  if (!existsSync(DEV_VARS)) throw new Error(`${DEV_VARS} is missing; see the setup steps in this script's header`);
  const vars = {};
  for (const line of readFileSync(DEV_VARS, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

/** Runs SQL against the LOCAL D1 only. */
function localSql(sql) {
  const dir = mkdtempSync(join(tmpdir(), "skillx-smoke-"));
  const file = join(dir, "seed.sql");
  writeFileSync(file, sql);
  try {
    const bin = join(WEB_DIR, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
    const result = spawnSync(`"${bin}"`, ["d1", "execute", "skillx-db", "--local", "--file", `"${file}"`], {
      cwd: WEB_DIR,
      encoding: "utf8",
      shell: true,
    });
    if (result.status !== 0) throw new Error(`local wrangler d1 execute failed:\n${result.stderr || result.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const enc = new TextEncoder();

/** Minimal deterministic ustar writer (paths under 100 bytes), like `skillx release pack`. */
function tarOf(files) {
  const parts = [];
  const octal = (block, offset, width, value) => block.set(enc.encode(`${value.toString(8).padStart(width - 1, "0")}\0`), offset);
  for (const { path, bytes, mode } of [...files].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))) {
    const header = new Uint8Array(512);
    header.set(enc.encode(path), 0);
    octal(header, 100, 8, mode);
    octal(header, 108, 8, 0);
    octal(header, 116, 8, 0);
    octal(header, 124, 12, bytes.length);
    octal(header, 136, 12, 0);
    header[156] = "0".charCodeAt(0);
    header.set(enc.encode("ustar\u000000"), 257);
    octal(header, 329, 8, 0);
    octal(header, 337, 8, 0);
    header.fill(0x20, 148, 156);
    const sum = header.reduce((n, b) => n + b, 0);
    header.set(enc.encode(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
    parts.push(header, bytes, new Uint8Array((512 - (bytes.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  return Buffer.concat(parts);
}

async function main() {
  const vars = readDevVars();
  if (!["1", "true"].includes((vars.SKILLX_RELEASES_API ?? "").toLowerCase())) throw new Error("set SKILLX_RELEASES_API=1 in apps/web/.dev.vars");
  const keyId = vars.SKILLX_REGISTRY_SIGNING_KEY_ID;
  const publicKey = createPublicKey(createPrivateKey({ key: Buffer.from(vars.SKILLX_REGISTRY_SIGNING_KEY ?? "", "base64"), format: "der", type: "pkcs8" }));

  const runId = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const slug = `smoke-${runId}`;
  const identity = `@smoke/${slug}`;
  const publishKey = `sx_${randomBytes(32).toString("hex")}`;
  const scopedHash = sha256(`skillx-scoped-api-key/v1:${publishKey}`);
  const now = Date.now();
  localSql(`
    INSERT OR IGNORE INTO publishers (id, handle, display_name, owner_user_id, created_at, state)
      VALUES ('pub-smoke', 'smoke', 'Local smoke', 'smoke-user', ${now}, 'active');
    INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, created_at, scopes)
      VALUES ('key-smoke-${runId}', 'smoke-user', 'local smoke', '${scopedHash}', '${publishKey.slice(0, 8)}', ${now}, '["releases:publish:@smoke"]');
  `);

  const script = enc.encode("#!/bin/sh\necho smoke ​\n");
  const files = [
    { path: "SKILL.md", bytes: enc.encode(`---\nname: ${slug}\ndescription: Local smoke skill\n---\n# Smoke\n`), mode: 0o644 },
    { path: "scripts/run.sh", bytes: script, mode: 0o755 },
  ];
  const tar = tarOf(files);
  const url = (path) => new URL(path, BASE).toString();

  const published = await fetch(url(`/api/v1/packages/${identity}/releases`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${publishKey}`,
      "Content-Type": "application/x-tar",
      "X-SkillX-Release": Buffer.from(JSON.stringify({ version: "1.0.0" })).toString("base64"),
    },
    body: tar,
  });
  const publishBody = await published.json();
  check("publish answers 200", published.status === 200, JSON.stringify(publishBody));
  if (published.status !== 200) return;
  const digest = publishBody.releaseDigest;

  const list = await fetch(url(`/api/v1/packages/${identity}/releases`));
  const listBody = await list.json();
  check("list shows the release", list.status === 200 && listBody.releases?.[0]?.releaseDigest === digest, JSON.stringify(listBody));

  const byVersion = await fetch(url(`/api/v1/packages/${identity}/releases/1.0.0`));
  const manifestBytes = Buffer.from(await byVersion.arrayBuffer());
  const manifestText = manifestBytes.toString("utf8");
  const manifest = JSON.parse(manifestText);
  // The canonical payload is the canonical document without its `signature` member.
  const payload = manifestText.replace(`,"signature":"${manifest.signature}"`, "").replace(`"signature":"${manifest.signature}",`, "");
  check("manifest by version is signed by the local key", byVersion.status === 200 && manifest.keyId === keyId &&
    verify(null, Buffer.from(payload), publicKey, Buffer.from(manifest.signature, "base64")));

  const byDigest = Buffer.from(await (await fetch(url(`/api/v1/releases/${digest}/manifest`))).arrayBuffer());
  check("manifest by digest has the same bytes", byDigest.equals(manifestBytes));

  for (const entry of manifest.files) {
    const res = await fetch(url(`/api/v1/releases/${digest}/files/${entry.path.split("/").map(encodeURIComponent).join("/")}`));
    const bytes = Buffer.from(await res.arrayBuffer());
    check(`file ${entry.path} hashes to the manifest sha256`, res.status === 200 && sha256(bytes) === entry.sha256 && res.headers.get("etag") === `"${entry.sha256}"`);
  }

  const artifact = await fetch(url(`/api/v1/releases/${digest}/artifact`), { redirect: "manual" });
  check("artifact streams the uploaded tar", artifact.status === 200 && Buffer.from(await artifact.arrayBuffer()).equals(tar));

  const traversal = await fetch(url(`/api/v1/releases/${digest}/files/scripts/..%2fSKILL.md`));
  check("encoded traversal answers 400", traversal.status === 400, String(traversal.status));
  const badDigest = await fetch(url(`/api/v1/releases/sha256:XYZ/manifest`));
  check("bad digest answers 400", badDigest.status === 400, String(badDigest.status));

  const keys = await (await fetch(url("/api/v1/keys"))).json();
  check("keys lists the active key ID", Array.isArray(keys.active) && keys.active.includes(keyId), JSON.stringify(keys));

  localSql(`UPDATE package_releases SET release_state = 'yanked', yanked_at = ${Date.now()}
              WHERE package_id = (SELECT id FROM packages WHERE name = '${identity}') AND version = '1.0.0';`);
  const yankedVersion = await fetch(url(`/api/v1/packages/${identity}/releases/1.0.0`));
  check("yanked release answers 410 by version", yankedVersion.status === 410, String(yankedVersion.status));
  const yankedDigest = await fetch(url(`/api/v1/releases/${digest}/manifest`));
  check("yanked release is served by digest with its state", yankedDigest.status === 200 && yankedDigest.headers.get("x-skillx-release-state") === "yanked");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    failures++;
  })
  .finally(() => {
    console.log(failures === 0 ? "smoke: all checks passed" : `smoke: ${failures} check(s) failed`);
    process.exitCode = failures === 0 ? 0 : 1;
  });
