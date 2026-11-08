// Run with: node --test scripts/agentkit-kit-mirror-plan.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { declaredTier, planMirror } from "./agentkit-kit-mirror-plan.mjs";

const root = mkdtempSync(join(tmpdir(), "kit-mirror-plan-"));
after(() => rmSync(root, { recursive: true, force: true }));

function kit(name, yaml, skills) {
  mkdirSync(join(root, "kits", name), { recursive: true });
  writeFileSync(join(root, "kits", name, "kit.yaml"), yaml);
  for (const s of skills) mkdirSync(join(root, "kits", name, "skills", s), { recursive: true });
}
kit("core", "name: core\ntier: free # shared\n", ["ak-bro"]);
kit("engineer", "name: engineer\ntier: \"paid\"\n", ["ak-plan"]);
kit("untiered", "name: untiered\n", ["ak-misc"]);

const digest = (c) => `sha256:${c.repeat(64)}`;
const pkg = (alias, ownerKit, extra = {}) => ({ kind: "foundation", identity: `@agentkit/${alias.slice(3)}`, alias, ownerKit, baseTreeDigest: digest("a"), ...extra });
const inspect = (...packages) => ({ data: { plan: { packages } } });

test("declaredTier reads the kit.yaml tier", () => {
  assert.equal(declaredTier(root, "core"), "free");
  assert.equal(declaredTier(root, "engineer"), "paid");
  assert.equal(declaredTier(root, "untiered"), "");
});

test("only free-tier kits are mirrored public, sorted by identity", () => {
  const plan = planMirror(inspect(pkg("ak-plan", "engineer"), pkg("ak-bro", "core"), pkg("ak-misc", "untiered")), root, "engineer", "0.2.0");
  assert.deepEqual(
    plan.entries.map((e) => [e.identity, e.path, e.visibility]),
    [
      ["@agentkit/bro", "kits/core/skills/ak-bro", "public"],
      ["@agentkit/misc", "kits/untiered/skills/ak-misc", "private"],
      ["@agentkit/plan", "kits/engineer/skills/ak-plan", "private"],
    ],
  );
  assert.equal(plan.entries[0].releaseDigest, digest("a"));
});

test("only narrows the plan and refuses unknown identities", () => {
  const all = inspect(pkg("ak-plan", "engineer"), pkg("ak-bro", "core"));
  assert.deepEqual(planMirror(all, root, "engineer", "0.2.0", ["@agentkit/plan"]).entries.map((e) => e.identity), ["@agentkit/plan"]);
  assert.throws(() => planMirror(all, root, "engineer", "0.2.0", ["@agentkit/nope"]), /not in the engineer kit/);
});

test("invalid packages are refused", () => {
  assert.throws(() => planMirror(inspect(), root, "engineer", "0.2.0"), /lists no packages/);
  assert.throws(() => planMirror(inspect(pkg("ak-plan", "engineer", { kind: "created" })), root, "engineer", "0.2.0"), /created package/);
  assert.throws(() => planMirror(inspect(pkg("ak-plan", "engineer", { identity: "@agentkit/other" })), root, "engineer", "0.2.0"), /does not map/);
  assert.throws(() => planMirror(inspect(pkg("ak-plan", "engineer", { baseTreeDigest: "sha1:x" })), root, "engineer", "0.2.0"), /no sha256/);
  assert.throws(() => planMirror(inspect(pkg("ak-gone", "engineer")), root, "engineer", "0.2.0"), /is not a directory/);
  assert.throws(() => planMirror(inspect(pkg("ak-plan", "engineer"), pkg("ak-plan", "engineer")), root, "engineer", "0.2.0"), /listed twice/);
});
