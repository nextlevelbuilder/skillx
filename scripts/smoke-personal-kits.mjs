#!/usr/bin/env node
/**
 * Enablement smoke of the personal kit API (`/api/v1/kits/...`).
 *
 * It answers one question: on this deployment, with `SKILLX_PERSONAL_KITS_API`
 * on, can an owner store a revision, replay it idempotently, activate it under
 * compare-and-set and read its lock, while anonymous and foreign callers see
 * nothing? It writes one throwaway private kit (`@handle/smoke-<random>`) and
 * prints a JSON receipt. It never prints a key.
 *
 * LOCAL BY DEFAULT: a non-loopback base URL is refused unless `--allow-remote`
 * is passed, so a staging run is always a deliberate choice. It never deploys
 * and never changes a flag.
 *
 * Usage:
 *   SKILLX_SMOKE_OWNER_KEY=<unscoped account key of @handle> \
 *   SKILLX_SMOKE_OTHER_KEY=<another account's key, optional> \
 *   node scripts/smoke-personal-kits.mjs --handle alpha --base-skill @alpha/demo@1.0.0 \
 *     [--base http://localhost:5173] [--allow-remote]
 *
 * The base skill must be a published release the owner can read. Exit code 0
 * when every check passes, 2 when the deployment answers `kit.api_disabled`
 * (the flag is off), 1 on any other failure.
 */
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const OVERLAY_SCHEMA = "agentkit.skill-overlay/v1";
const KIT_SCHEMA = "skillx.personal-kit/v1";

/** `@pub/slug@1.2.3` into its package and version. */
export function parseBaseSkill(raw) {
  const m = /^(@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)@([0-9A-Za-z.+-]+)$/.exec(raw ?? "");
  if (m === null) throw new Error(`--base-skill must be @publisher/slug@version, got ${JSON.stringify(raw)}`);
  return { pkg: m[1], version: m[2] };
}

/**
 * Runs the smoke against `base` through `fetchImpl` and returns the receipt.
 * Every check is recorded with its status and error code; the run stops at
 * the first failure whose later checks depend on it.
 */
export async function runPersonalKitSmoke({ fetchImpl = fetch, base, ownerKey, otherKey, handle, baseSkill, name, idempotencyKey }) {
  if (typeof ownerKey !== "string" || ownerKey === "") throw new Error("an owner API key is required");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(handle ?? "")) throw new Error(`--handle must be a lowercase publisher handle, got ${JSON.stringify(handle)}`);
  const { pkg, version } = parseBaseSkill(baseSkill);
  const kitName = name ?? `smoke-${randomBytes(4).toString("hex")}`;
  const kit = `@${handle}/${kitName}`;
  const origin = new URL(base).origin;
  const kitUrl = (sub = "") => `${origin}/api/v1/kits/${kit}${sub === "" ? "" : `/${sub}`}`;
  const checks = [];
  const receipt = { schema: "skillx.personal-kits-smoke/v1", target: origin, kit, baseSkill: `${pkg}@${version}`, enabled: null, checks, ok: false };

  async function request(url, { key = ownerKey, method = "GET", body, headers = {} } = {}) {
    const h = new Headers({ Accept: "application/json", ...headers });
    if (key !== null) h.set("Authorization", `Bearer ${key}`);
    if (body !== undefined) h.set("Content-Type", "application/json");
    const res = await fetchImpl(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, body: json, code: json?.error?.code ?? null };
  }

  function check(label, res, ok) {
    checks.push({ label, ok, status: res.status, code: res.code });
    return ok;
  }

  // 1. Is the API on? Flag off answers 404 kit.api_disabled before any auth or lookup.
  const probe = await request(kitUrl());
  if (probe.status === 404 && probe.code === "kit.api_disabled") {
    receipt.enabled = false;
    check("api enabled", probe, false);
    return receipt;
  }
  receipt.enabled = true;
  if (!check("unknown kit is 404 not_found", probe, probe.status === 404 && probe.code === "not_found")) return receipt;

  // 2. Anonymous callers are refused.
  const anon = await request(kitUrl(), { key: null });
  check("anonymous is 401", anon, anon.status === 401);

  // 3. Resolve the pinned base release digest.
  const manifest = await request(`${origin}/api/v1/packages/${pkg}/releases/${version}`);
  const releaseDigest = manifest.body?.releaseDigest;
  if (!check("base release readable", manifest, manifest.status === 200 && typeof releaseDigest === "string")) return receipt;

  // 4. Store a draft revision: one override entry with no overlay ops.
  const document = {
    schema: KIT_SCHEMA,
    kit,
    localId: `local/${kitName}`,
    visibility: "private",
    skills: [
      {
        identity: pkg,
        mode: "override",
        base: { package: pkg, version, releaseDigest },
        overlay: { schema: OVERLAY_SCHEMA, baseTreeDigest: releaseDigest, ops: [] },
        compositionDigest: releaseDigest,
      },
    ],
    exclude: [],
    runtimes: {},
  };
  const idem = idempotencyKey ?? `smoke-${randomBytes(8).toString("hex")}`;
  const created = await request(kitUrl("revisions"), { method: "POST", body: { expectedGeneration: 0, idempotencyKey: idem, document } });
  const revision = created.body?.revision;
  if (!check("store revision is 201", created, created.status === 201 && created.body?.generation === 1 && typeof revision?.id === "string")) return receipt;

  // 5. Replaying the same request changes nothing.
  const replay = await request(kitUrl("revisions"), { method: "POST", body: { expectedGeneration: 0, idempotencyKey: idem, document } });
  check("idempotent replay is 200", replay, replay.status === 200 && replay.body?.replayed === true && replay.body?.revision?.id === revision.id);

  // 6. Activation under compare-and-set: a stale If-Match is 412, the current one activates.
  const approve = { revisionId: revision.id, approval: { revisionDigest: revision.digest } };
  const stale = await request(kitUrl("activate"), { method: "POST", body: approve, headers: { "If-Match": '"g0"' } });
  check("stale If-Match is 412", stale, stale.status === 412 && stale.code === "kit.generation_conflict");
  const activated = await request(kitUrl("activate"), { method: "POST", body: approve, headers: { "If-Match": '"g1"' } });
  if (!check("activate is 200 with a lock", activated, activated.status === 200 && activated.body?.lock?.kit === kit)) return receipt;

  // 7. The lock reads back identically.
  const lock = await request(kitUrl("lock"));
  check("lock reads back", lock, lock.status === 200 && JSON.stringify(lock.body?.lock) === JSON.stringify(activated.body.lock));

  // 8. Another account sees the same 404 as an unknown kit.
  if (typeof otherKey === "string" && otherKey !== "") {
    const foreign = await request(kitUrl(), { key: otherKey });
    check("other account is 404", foreign, foreign.status === 404 && foreign.code === "not_found");
  }

  receipt.ok = checks.every((c) => c.ok);
  return receipt;
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(args) {
  const base = new URL(argValue(args, "--base") ?? "http://localhost:5173");
  if (!LOOPBACK.has(base.hostname) && !args.includes("--allow-remote")) {
    console.error(`refusing non-loopback base URL ${base.origin}; pass --allow-remote to smoke a deployed SkillX on purpose`);
    return 1;
  }
  const receipt = await runPersonalKitSmoke({
    base: base.href,
    ownerKey: process.env.SKILLX_SMOKE_OWNER_KEY,
    otherKey: process.env.SKILLX_SMOKE_OTHER_KEY,
    handle: argValue(args, "--handle"),
    baseSkill: argValue(args, "--base-skill"),
  });
  console.log(JSON.stringify({ ...receipt, at: new Date().toISOString() }, null, 2));
  if (receipt.enabled === false) {
    console.error("this deployment answers 404 kit.api_disabled: SKILLX_PERSONAL_KITS_API is off");
    return 2;
  }
  return receipt.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
