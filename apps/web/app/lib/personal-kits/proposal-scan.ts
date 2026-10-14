/**
 * Content checks of a session-derived proposal, over the files the new
 * overlay changes or adds against the from-revision composition (plus the
 * evidence summary). A secret or an absolute local path (home directory,
 * Windows user profile, UNC share) refuses the proposal before anything is
 * stored; any other `danger` finding stores it `quarantined`. Findings name
 * a rule and a path, never the matched text.
 *
 * The permissions a change requires are derived from the two compositions:
 * a new `allowed-tools` entry (or dropping the restriction: `allowed-tools:*`),
 * a new or changed `hooks` value, a changed declared script or executable
 * file (`script:<path>`), a newly executable file (`executable:<path>`) and
 * a changed binary file (`binary:<path>`).
 */
import { applyOverlay, textOf, treeFacts } from "@skillx/contracts";
import type { KitTree, SkillOverlay } from "@skillx/contracts";
import { scanRelease } from "~/lib/releases/release-scan";

export interface ProposalScan {
  /** Sorted permissions the change needs. */
  required: string[];
  /** `danger:<rule>:<path>` codes that refuse the proposal (secrets, local paths). */
  refusing: string[];
  /** Other `danger:` codes; the proposal is stored quarantined. */
  quarantining: string[];
  /** Paths the new overlay changes or adds. */
  changed: string[];
}

export const EVIDENCE_PATH = "evidence/summary.md";

const LOCAL_PATHS: ReadonlyArray<RegExp> = [
  /(?:^|[\s"'`(=:,[])\/(?:home|Users)\/[A-Za-z0-9._-]+/,
  /(?:^|[\s"'`(=:,[])\/root(?:\/|\b)/,
  /\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][A-Za-z0-9._ -]+/i,
  /\\\\[A-Za-z0-9._-]+\\[A-Za-z0-9.$_-]+/,
];

/** True when `text` names an absolute path on someone's machine. */
export const hasLocalPath = (text: string) => LOCAL_PATHS.some((re) => re.test(text));

async function changedFiles(before: KitTree, after: KitTree) {
  const old = new Map(before.files.map((f) => [f.path, f]));
  const out: Array<{ path: string; bytes: Uint8Array; added: boolean; becameExecutable: boolean }> = [];
  for (const f of after.files) {
    const prev = old.get(f.path);
    if (prev !== undefined && prev.sha256 === f.sha256 && prev.mode === f.mode) continue;
    out.push({ path: f.path, bytes: await after.read(f.path), added: prev === undefined, becameExecutable: f.mode === "100755" && prev?.mode !== "100755" });
  }
  return out;
}

/** Scans and classifies a proposal. `fromOverlay` and `overlay` both apply to `base`. */
export async function scanProposal(base: KitTree, fromOverlay: SkillOverlay, overlay: SkillOverlay, evidenceSummary: string | null): Promise<ProposalScan> {
  const [before, after] = [await applyOverlay(base, fromOverlay), await applyOverlay(base, overlay)];
  const changed = await changedFiles(before, after);
  const [was, now] = [await treeFacts(before), await treeFacts(after)];
  const required = new Set<string>();
  if (now.allowedTools === null && was.allowedTools !== null) required.add("allowed-tools:*");
  if (now.allowedTools !== null && was.allowedTools !== null) for (const t of now.allowedTools) if (!was.allowedTools.includes(t)) required.add(`allowed-tools:${t}`);
  if (now.hooks !== null && now.hooks !== was.hooks) required.add("hooks");
  const code = new Set([...now.scripts, ...now.executables]);
  for (const f of changed) {
    if (f.becameExecutable) required.add(`executable:${f.path}`);
    else if (code.has(f.path)) required.add(`script:${f.path}`);
    if (textOf(f.bytes) === null) required.add(`binary:${f.path}`);
  }

  const scanned = changed.map(({ path, bytes }) => ({ path, bytes }));
  if (evidenceSummary !== null) scanned.push({ path: EVIDENCE_PATH, bytes: new TextEncoder().encode(evidenceSummary) });
  const refusing: string[] = [];
  const quarantining: string[] = [];
  for (const finding of scanRelease(scanned).findings) (finding.startsWith("danger:secret-") ? refusing : quarantining).push(finding);
  for (const { path, bytes } of scanned) {
    const text = textOf(bytes);
    if (text !== null && hasLocalPath(text)) refusing.push(`danger:local-path:${path}`);
  }
  return { required: [...required].sort(), refusing: refusing.sort(), quarantining: quarantining.sort(), changed: changed.map((f) => f.path) };
}
