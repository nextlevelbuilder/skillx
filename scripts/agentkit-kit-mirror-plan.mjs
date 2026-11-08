#!/usr/bin/env node
/**
 * Plans the @agentkit mirror of one AgentKit kit from `ak skills kit inspect
 * --json` of a personal kit that extends it (see
 * .github/workflows/publish-agentkit-kit-mirror.yml).
 *
 * Usage: agentkit-kit-mirror-plan.mjs <inspect.json> <agentkit root> <kit> <version> [only]
 *
 * Prints {kit, version, entries: [{identity, path, releaseDigest, ownerKit,
 * visibility}]}, sorted by identity. `path` is kits/<ownerKit>/skills/<alias>
 * inside the AgentKit checkout. A skill of a kit whose kit.yaml declares
 * `tier: free` is public; every other skill is private, so paid kit content
 * is never published public. `only` (space separated identities) narrows the
 * plan and must name planned packages. Tests: node --test scripts/agentkit-kit-mirror-plan.test.mjs
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const IDENTITY = /^@agentkit\/[a-z0-9][a-z0-9._-]*$/;
const ALIAS = /^ak-[a-z0-9][a-z0-9._-]*$/;
const KIT = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(message);
}

/** The declared tier of kits/<kit>/kit.yaml: "free", "paid" or "" (none). */
export function declaredTier(root, kit) {
  const text = readFileSync(join(root, "kits", kit, "kit.yaml"), "utf8");
  const match = /^tier:[ \t]*["']?([A-Za-z]+)["']?[ \t]*(?:#.*)?$/m.exec(text);
  return match ? match[1].toLowerCase() : "";
}

export function planMirror(inspect, root, kit, version, only = []) {
  const packages = inspect?.data?.plan?.packages;
  if (!Array.isArray(packages) || packages.length === 0) fail("the inspect output lists no packages");
  const tiers = new Map();
  const visibilityOf = (ownerKit) => {
    if (!tiers.has(ownerKit)) tiers.set(ownerKit, declaredTier(root, ownerKit) === "free" ? "public" : "private");
    return tiers.get(ownerKit);
  };
  const entries = [];
  for (const p of packages) {
    if (p.kind !== "foundation") fail(`${p.identity} is a ${p.kind} package; mirror a plain extension of the kit`);
    if (!IDENTITY.test(p.identity ?? "")) fail(`${p.identity} is not an @agentkit/<slug> identity`);
    if (!ALIAS.test(p.alias ?? "") || p.identity !== `@agentkit/${p.alias.slice(3)}`) fail(`${p.identity} does not map to its directory ${p.alias}`);
    if (!KIT.test(p.ownerKit ?? "")) fail(`${p.identity} has an invalid owner kit ${p.ownerKit}`);
    if (!DIGEST.test(p.baseTreeDigest ?? "")) fail(`${p.identity} has no sha256 base tree digest`);
    const path = `kits/${p.ownerKit}/skills/${p.alias}`;
    const abs = join(root, path);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) fail(`${path} is not a directory`);
    entries.push({ identity: p.identity, path, releaseDigest: p.baseTreeDigest, ownerKit: p.ownerKit, visibility: visibilityOf(p.ownerKit) });
  }
  entries.sort((a, b) => (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0));
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].identity === entries[i - 1].identity) fail(`${entries[i].identity} is listed twice`);
  }
  if (only.length === 0) return { kit, version, entries };
  const unknown = only.filter((id) => !entries.some((e) => e.identity === id));
  if (unknown.length > 0) fail(`not in the ${kit} kit: ${unknown.join(", ")}`);
  return { kit, version, entries: entries.filter((e) => only.includes(e.identity)) };
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const [inspectPath, root, kit, version, onlyArg = ""] = process.argv.slice(2);
    if (!inspectPath || !root || !kit || !version) fail("usage: <inspect.json> <agentkit root> <kit> <version> [only]");
    if (!KIT.test(kit)) fail(`invalid kit ${kit}`);
    const only = onlyArg.split(/\s+/).filter(Boolean);
    const plan = planMirror(JSON.parse(readFileSync(inspectPath, "utf8")), root, kit, version, only);
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`agentkit-kit-mirror-plan: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}
