/**
 * Semantic rebase checks. The user approved composition `C0` (their overlay
 * on the old base); a clean textual rebase gives candidate `C1` on the new
 * base. Any change between C0 and C1 in the reviewed surface (scripts,
 * executable modes, allowed tools, hooks, exposure, license, dependencies,
 * local links) becomes a finding, so it is never adopted silently.
 */
import { compareUtf8 } from "@skillx/skill-tree/rules";
import type { RebaseCategory } from "./codes";
import { treeFacts } from "./frontmatter-facts";
import type { TreeFacts } from "./frontmatter-facts";
import type { KitTree } from "./kit-tree";

export interface RebaseFinding {
  category: RebaseCategory;
  /** Tree path, or "" for a skill-wide fact. */
  path: string;
  detail: string;
}

const diff = (a: readonly string[], b: readonly string[]) => ({
  added: b.filter((x) => !a.includes(x)),
  removed: a.filter((x) => !b.includes(x)),
});

const list = (xs: string[]) => xs.join(", ");

function toolFindings(before: TreeFacts, after: TreeFacts): RebaseFinding[] {
  const a = before.allowedTools;
  const b = after.allowedTools;
  if (a === null && b === null) return [];
  // No `allowed-tools` key means no restriction: dropping the key escalates, adding it downgrades.
  if (a !== null && b === null) return [{ category: "conflict.capability_escalation", path: "SKILL.md", detail: "allowed-tools restriction removed" }];
  if (a === null && b !== null) return [{ category: "conflict.capability_downgrade", path: "SKILL.md", detail: `allowed-tools restricted to: ${list(b)}` }];
  const { added, removed } = diff(a!, b!);
  const out: RebaseFinding[] = [];
  if (added.length > 0) out.push({ category: "conflict.capability_escalation", path: "SKILL.md", detail: `allowed-tools added: ${list(added)}` });
  if (removed.length > 0) out.push({ category: "conflict.capability_downgrade", path: "SKILL.md", detail: `allowed-tools removed: ${list(removed)}` });
  return out;
}

/** Findings for the semantic difference of two composed trees. */
export async function semanticFindings(c0: KitTree, c1: KitTree): Promise<RebaseFinding[]> {
  const before = await treeFacts(c0);
  const after = await treeFacts(c1);
  const out: RebaseFinding[] = [...toolFindings(before, after)];
  const scripts = diff(before.scripts, after.scripts);
  for (const p of [...scripts.added, ...scripts.removed]) out.push({ category: "conflict.script_changed", path: p, detail: scripts.added.includes(p) ? "script declared" : "script no longer declared" });
  const oldFiles = new Map(c0.files.map((f) => [f.path, f]));
  for (const f of c1.files) {
    const old = oldFiles.get(f.path);
    if (old === undefined) continue;
    if (after.scripts.includes(f.path) && old.sha256 !== f.sha256) out.push({ category: "conflict.script_changed", path: f.path, detail: "script content changed" });
  }
  const exec = diff(before.executables, after.executables);
  for (const p of exec.added) out.push({ category: "conflict.mode_changed", path: p, detail: "file became executable" });
  for (const p of exec.removed) if (c1.files.some((f) => f.path === p)) out.push({ category: "conflict.mode_changed", path: p, detail: "file is no longer executable" });
  if (before.hooks !== after.hooks) out.push({ category: "conflict.capability_escalation", path: "SKILL.md", detail: "hooks changed" });
  if (before.exposure !== after.exposure) out.push({ category: "conflict.exposure_changed", path: "SKILL.md", detail: `${before.exposure} -> ${after.exposure}` });
  if (before.license !== after.license) out.push({ category: "conflict.license_changed", path: "SKILL.md", detail: `${before.license ?? "none"} -> ${after.license ?? "none"}` });
  for (const dep of diff(before.dependencies, after.dependencies).removed) out.push({ category: "conflict.dependency_removed", path: "SKILL.md", detail: `dependency ${dep} removed` });
  const present = new Set(c1.files.map((f) => f.path));
  const wasPresent = new Set(c0.files.map((f) => f.path));
  for (const link of after.links) {
    if (!present.has(link) && wasPresent.has(link)) out.push({ category: "conflict.dependency_missing", path: link, detail: "SKILL.md links a file the candidate no longer has" });
  }
  return out;
}

export const sortFindings = (findings: RebaseFinding[]) =>
  [...findings].sort((a, b) => compareUtf8(a.path, b.path) || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0) || (a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0));
