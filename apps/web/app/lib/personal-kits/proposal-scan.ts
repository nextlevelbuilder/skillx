/**
 * Content checks of a session-derived proposal, over what the new overlay
 * introduces against the from-revision composition: the lines a changed
 * file gains (a new file counts whole) plus the evidence summary. Lines
 * kept from the base are not scanned, so a finding already in the base
 * never refuses a proposal. Refused before anything is stored: a secret
 * (vendor token rules and generic credentials), an absolute local path (see
 * `proposal-detectors`), binary content and text with a byte order mark.
 * Any other `danger` finding stores the proposal `quarantined`. Findings
 * name a rule and a path, never the matched text.
 *
 * The permissions a change requires are derived from the two compositions:
 * a new `allowed-tools` entry (or dropping the restriction: `allowed-tools:*`),
 * a new or changed `hooks` value, a changed declared script or executable
 * file (`script:<path>`) and a newly executable file (`executable:<path>`).
 */
import { applyOverlay, textOf, treeFacts } from "@skillx/contracts";
import type { KitTree, SkillOverlay } from "@skillx/contracts";
import { scanRelease } from "~/lib/releases/release-scan";
import { addedLines, genericSecrets, hasByteOrderMark, hasLocalPath, hasMultilinePassword } from "./proposal-detectors";

export interface ProposalScan {
  /** Sorted permissions the change needs. */
  required: string[];
  /** `danger:<rule>:<path>` codes that refuse the proposal (secrets, local paths, binary or BOM content). */
  refusing: string[];
  /** Other `danger:` codes; the proposal is stored quarantined. */
  quarantining: string[];
  /** Paths the new overlay changes or adds. */
  changed: string[];
}

export const EVIDENCE_PATH = "evidence/summary.md";

interface Changed {
  path: string;
  /** What the change introduces, or null for binary or BOM content (refused). */
  introduced: string | null;
  /** The change adds a YAML password whose value sits below its key line. */
  multilinePassword: boolean;
  bom: boolean;
  becameExecutable: boolean;
}

async function changedFiles(before: KitTree, after: KitTree): Promise<Changed[]> {
  const old = new Map(before.files.map((f) => [f.path, f]));
  const out: Changed[] = [];
  for (const f of after.files) {
    const prev = old.get(f.path);
    if (prev !== undefined && prev.sha256 === f.sha256 && prev.mode === f.mode) continue;
    const bytes = await after.read(f.path);
    const bom = hasByteOrderMark(bytes);
    const text = bom ? null : textOf(bytes);
    const was = prev === undefined || text === null ? null : textOf(await before.read(f.path));
    out.push({
      path: f.path,
      introduced: text === null ? null : addedLines(was, text),
      multilinePassword: text !== null && hasMultilinePassword(was, text),
      bom,
      becameExecutable: f.mode === "100755" && prev?.mode !== "100755",
    });
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
  const refusing = new Set<string>();
  const texts: Array<{ path: string; text: string }> = [];
  for (const f of changed) {
    if (f.becameExecutable) required.add(`executable:${f.path}`);
    else if (code.has(f.path)) required.add(`script:${f.path}`);
    if (f.introduced === null) refusing.add(`danger:${f.bom ? "byte-order-mark" : "binary-content"}:${f.path}`);
    else texts.push({ path: f.path, text: f.introduced });
    if (f.multilinePassword) refusing.add(`danger:secret-password:${f.path}`);
  }
  if (evidenceSummary !== null) {
    texts.push({ path: EVIDENCE_PATH, text: evidenceSummary });
    if (hasMultilinePassword(null, evidenceSummary)) refusing.add(`danger:secret-password:${EVIDENCE_PATH}`);
  }

  const quarantining = new Set<string>();
  const encoder = new TextEncoder();
  const findings = scanRelease(texts.map(({ path, text }) => ({ path, bytes: encoder.encode(text) }))).findings;
  for (const finding of findings) (finding.startsWith("danger:secret-") ? refusing : quarantining).add(finding);
  for (const { path, text } of texts) {
    if (hasLocalPath(text)) refusing.add(`danger:local-path:${path}`);
    for (const rule of genericSecrets(text)) refusing.add(`danger:${rule}:${path}`);
  }
  return { required: [...required].sort(), refusing: [...refusing].sort(), quarantining: [...quarantining].sort(), changed: changed.map((f) => f.path) };
}
