#!/usr/bin/env node
/**
 * Enablement smoke of the personal kit API (`/api/v1/kits/...`).
 *
 * It answers one question: on this deployment, with `SKILLX_PERSONAL_KITS_API`
 * on, can an owner store a revision, replay it idempotently, activate it under
 * compare-and-set and read its lock, while anonymous and foreign callers can
 * neither read nor write it? It prints a JSON receipt and never prints a key.
 *
 * LOCAL BY DEFAULT: a non-loopback base URL is refused unless `--allow-remote`
 * is passed, so a staging run is always a deliberate choice, and a remote run
 * also needs an https base URL and a second account key so the keys never
 * travel in clear text and the cross-account checks always run. It
 * never deploys, never changes a flag and never follows a redirect.
 *
 * CLEANUP: the API cannot delete a kit (revisions and the audit are immutable
 * and kits are ON DELETE RESTRICT), so the smoke reuses one fixed private kit,
 * `@handle/<--kit-name>` (default `agentkit-smoke`), instead of creating a new
 * one per run. Every run appends one revision to it and activates that
 * revision; the receipt names the kit. Run it from a dedicated smoke account
 * and publisher so the kit never sits next to a real user's kits.
 *
 * Usage:
 *   SKILLX_SMOKE_OWNER_KEY=<unscoped account key of @handle> \
 *   SKILLX_SMOKE_OTHER_KEY=<another account's key; required with --allow-remote> \
 *   node scripts/smoke-personal-kits.mjs --handle alpha --base-skill @alpha/demo@1.0.0 \
 *     [--kit-name agentkit-smoke] [--base http://localhost:5173] [--allow-remote]
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
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const DEFAULT_KIT_NAME = "agentkit-smoke";

/** `@pub/slug@1.2.3` into its package and version. */
export function parseBaseSkill(raw) {
  const m = /^(@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)@([0-9A-Za-z.+-]+)$/.exec(raw ?? "");
  if (m === null) throw new Error(`--base-skill must be @publisher/slug@version, got ${JSON.stringify(raw)}`);
  return { pkg: m[1], version: m[2] };
}

const hex = (n) => randomBytes(n).toString("hex");

/**
 * Runs the smoke against `base` through `fetchImpl` and returns the receipt.
 * Every check is recorded with its status and error code; the run stops at
 * the first failure whose later checks depend on it. The cross-account
 * checks run when `otherKey` is given.
 */
export async function runPersonalKitSmoke({ fetchImpl = fetch, base, ownerKey, otherKey, handle, baseSkill, name = DEFAULT_KIT_NAME, idempotencyKey, runId }) {
  if (typeof ownerKey !== "string" || ownerKey === "") throw new Error("an owner API key is required");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(handle ?? "")) throw new Error(`--handle must be a lowercase publisher handle, got ${JSON.stringify(handle)}`);
  if (!NAME.test(name ?? "") || name.length > 48) throw new Error(`--kit-name must be lowercase [a-z0-9] words joined by hyphens, got ${JSON.stringify(name)}`);
  const { pkg, version } = parseBaseSkill(baseSkill);
  const run = runId ?? hex(6);
  const kit = `@${handle}/${name}`;
  const origin = new URL(base).origin;
  const kitUrl = (sub = "", of = kit) => `${origin}/api/v1/kits/${of}${sub === "" ? "" : `/${sub}`}`;
  const checks = [];
  const receipt = { schema: "skillx.personal-kits-smoke/v1", target: origin, kit, run, baseSkill: `${pkg}@${version}`, enabled: null, crossAccount: false, checks, ok: false };

  async function request(url, { key = ownerKey, method = "GET", body, headers = {} } = {}) {
    const h = new Headers({ Accept: "application/json", ...headers });
    if (key !== null) h.set("Authorization", `Bearer ${key}`);
    if (body !== undefined) h.set("Content-Type", "application/json");
    // Never follow a redirect: it would carry the key to another location,
    // and a 3xx is a failed check, not an answer.
    const res = await fetchImpl(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) return { status: res.status, body: null, code: "redirect" };
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
  const unknown = `@${handle}/smoke-probe-${hex(4)}`;
  const probe = await request(kitUrl("", unknown));
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

  // 4. The reused smoke kit's current generation (0 when it does not exist yet).
  const current = await request(kitUrl());
  const generation = current.status === 404 && current.code === "not_found" ? 0 : current.body?.generation;
  if (!check("smoke kit generation readable", current, Number.isInteger(generation))) return receipt;

  // 5. Store a draft revision: one override entry with no overlay ops. The
  // profile names the run, so a reused kit gets a new revision every run.
  const documentFor = (of) => ({
    schema: KIT_SCHEMA,
    kit: of,
    localId: `local/${of.slice(of.indexOf("/") + 1)}`,
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
    profile: `smoke-${run}`,
    runtimes: {},
  });
  const document = documentFor(kit);
  const idem = idempotencyKey ?? `smoke-${run}`;
  const store = { method: "POST", body: { expectedGeneration: generation, idempotencyKey: idem, document } };
  const created = await request(kitUrl("revisions"), store);
  const revision = created.body?.revision;
  if (!check("store revision is 201", created, created.status === 201 && created.body?.generation === generation + 1 && typeof revision?.id === "string")) return receipt;

  // 6. Replaying the same request changes nothing.
  const replay = await request(kitUrl("revisions"), store);
  check("idempotent replay is 200", replay, replay.status === 200 && replay.body?.replayed === true && replay.body?.revision?.id === revision.id);

  // 7. Activation under compare-and-set: a stale If-Match is 412, the current one activates.
  const approve = { revisionId: revision.id, approval: { revisionDigest: revision.digest } };
  const stale = await request(kitUrl("activate"), { method: "POST", body: approve, headers: { "If-Match": `"g${generation}"` } });
  check("stale If-Match is 412", stale, stale.status === 412 && stale.code === "kit.generation_conflict");
  const activated = await request(kitUrl("activate"), { method: "POST", body: approve, headers: { "If-Match": `"g${generation + 1}"` } });
  if (!check("activate is 200 with a lock", activated, activated.status === 200 && activated.body?.lock?.kit === kit)) return receipt;

  // 8. The lock reads back identically.
  const lock = await request(kitUrl("lock"));
  check("lock reads back", lock, lock.status === 200 && JSON.stringify(lock.body?.lock) === JSON.stringify(activated.body.lock));

  // 9. Another account can neither read nor write the kit, nor create one
  // under the owner's handle, and the owner's kit is unchanged afterwards.
  if (typeof otherKey === "string" && otherKey !== "") {
    receipt.crossAccount = true;
    const before = await request(kitUrl());
    const foreign = await request(kitUrl(), { key: otherKey });
    check("other account read is 404", foreign, foreign.status === 404 && foreign.code === "not_found");
    const foreignStore = await request(kitUrl("revisions"), {
      key: otherKey,
      method: "POST",
      body: { expectedGeneration: before.body?.generation, idempotencyKey: `smoke-${run}-other`, document: { ...document, profile: `smoke-${run}-other` } },
    });
    check("other account write is 404", foreignStore, foreignStore.status === 404 && foreignStore.code === "not_found");
    const foreignActivate = await request(kitUrl("activate"), { key: otherKey, method: "POST", body: approve, headers: { "If-Match": `"g${before.body?.generation}"` } });
    check("other account activate is 404", foreignActivate, foreignActivate.status === 404 && foreignActivate.code === "not_found");
    const squat = `@${handle}/smoke-squat-${hex(4)}`;
    const foreignCreate = await request(kitUrl("revisions", squat), {
      key: otherKey,
      method: "POST",
      body: { expectedGeneration: 0, idempotencyKey: `smoke-${run}-squat`, document: documentFor(squat) },
    });
    check("other account cannot create under the handle", foreignCreate, foreignCreate.status === 403 && foreignCreate.code === "kit.publisher_not_owned");
    const after = await request(kitUrl());
    check(
      "owner kit unchanged by the other account",
      after,
      before.status === 200 && after.status === 200 && JSON.stringify(after.body) === JSON.stringify(before.body),
    );
  }

  receipt.ok = checks.every((c) => c.ok);
  return receipt;
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function main(args, env = process.env, { fetchImpl = fetch, log = console.log, error = console.error } = {}) {
  const base = new URL(argValue(args, "--base") ?? "http://localhost:5173");
  if (!LOOPBACK.has(base.hostname)) {
    if (!args.includes("--allow-remote")) {
      error(`refusing non-loopback base URL ${base.origin}; pass --allow-remote to smoke a deployed SkillX on purpose`);
      return 1;
    }
    if (base.protocol !== "https:") {
      error(`refusing ${base.origin}: a remote run sends account keys, so its base URL must be https`);
      return 1;
    }
    if (!env.SKILLX_SMOKE_OTHER_KEY) {
      error("--allow-remote needs SKILLX_SMOKE_OTHER_KEY (a second account's key) so the cross-account read and write checks run");
      return 1;
    }
  }
  const receipt = await runPersonalKitSmoke({
    fetchImpl,
    base: base.href,
    ownerKey: env.SKILLX_SMOKE_OWNER_KEY,
    otherKey: env.SKILLX_SMOKE_OTHER_KEY,
    handle: argValue(args, "--handle"),
    baseSkill: argValue(args, "--base-skill"),
    name: argValue(args, "--kit-name") ?? DEFAULT_KIT_NAME,
  });
  log(JSON.stringify({ ...receipt, at: new Date().toISOString() }, null, 2));
  if (receipt.enabled === false) {
    error("this deployment answers 404 kit.api_disabled: SKILLX_PERSONAL_KITS_API is off");
    return 2;
  }
  return receipt.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    },
  );
}
