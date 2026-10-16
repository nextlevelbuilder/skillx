/**
 * Conflict review. A conflict is resolved only by the user's explicit
 * decision per entry (`approvedBy: "user"`); an agent may attach a
 * suggestion, which is stored for the record and never applied. Choices:
 *
 * - `keep-old`: the entry stays on its current base, overlay unchanged.
 * - `use-upstream`: the new base with no overlay; needs `discardUserDelta: true`.
 * - `edit-overlay`: the new base with a user-supplied overlay and digest (verified).
 * - `fork`: the entry follows upstream unmodified and the user's composition
 *   moves to a new fork identity under the kit handle with its own alias.
 *
 * The result is a draft `resolution` revision written atomically with the
 * conflict's resolution record; it still needs activation.
 */
import { RESOLUTION_SCHEMA, compareUtf8, emptyOverlay, revisionDigest, validateOverlay } from "@skillx/contracts";
import type { KitSkillEntry, PersonalKitDocument } from "@skillx/contracts";
import { badRequest, conflict, json, kitNotFound } from "./kit-http";
import type { KitCaller } from "./kit-http";
import { assertSeedRevision, commitKitMutation, documentOf, getRevision, ownedKit, revisionView, writableKit } from "./kit-store";
import { generationConflict, storeRevision, storedResponse, withoutComposition } from "./kit-revisions";
import type { RebaseReport } from "./kit-rebase";

const CHOICES = ["keep-old", "use-upstream", "edit-overlay", "fork"] as const;
type Choice = (typeof CHOICES)[number];
const MAX_SUGGESTION_BYTES = 16 * 1024;

interface ConflictRow {
  id: string;
  kit_id: string;
  from_revision_id: string;
  report_json: string;
  status: string;
  resolution_json: string | null;
  resolved_revision_id: string | null;
  reeval_required: number;
}

interface Decision {
  identity: string;
  choice: Choice;
  discardUserDelta?: boolean;
  overlay?: unknown;
  compositionDigest?: string;
  forkIdentity?: string;
  alias?: string;
}

async function loadConflict(caller: KitCaller, kitId: string, id: string): Promise<ConflictRow> {
  const row = await caller.env.DB.prepare("SELECT * FROM personal_kit_conflicts WHERE kit_id = ? AND id = ?").bind(kitId, id).first<ConflictRow>();
  if (row === null) throw kitNotFound();
  return row;
}

const view = (row: ConflictRow) => ({
  id: row.id,
  status: row.status,
  fromRevisionId: row.from_revision_id,
  report: (JSON.parse(row.report_json) as { report: RebaseReport }).report,
  resolution: row.resolution_json === null ? null : JSON.parse(row.resolution_json),
  resolvedRevisionId: row.resolved_revision_id,
  reevalRequired: Number(row.reeval_required) === 1,
});

export async function readConflicts(caller: KitCaller, kitName: string): Promise<Response> {
  const kit = await ownedKit(caller.env.DB, kitName, caller.userId);
  const { results } = await caller.env.DB.prepare("SELECT * FROM personal_kit_conflicts WHERE kit_id = ? ORDER BY created_at DESC, id LIMIT 100").bind(kit.id).all<ConflictRow>();
  return json({ kit: kit.name, conflicts: results.map(view) });
}

export async function readConflict(caller: KitCaller, kitName: string, id: string): Promise<Response> {
  const kit = await ownedKit(caller.env.DB, kitName, caller.userId);
  return json(view(await loadConflict(caller, kit.id, id)));
}

function parseDecisions(raw: unknown): Decision[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 128) throw badRequest("decisions must hold 1 to 128 items");
  return raw.map((d, i) => {
    if (typeof d !== "object" || d === null || typeof d.identity !== "string" || !CHOICES.includes(d.choice)) {
      throw badRequest(`decisions[${i}] must be {identity, choice: ${CHOICES.join(" | ")}, ...}`);
    }
    return d as Decision;
  });
}

function applyDecision(entry: KitSkillEntry, d: Decision, to: { version: string; releaseDigest: string }): KitSkillEntry[] {
  const upstream: KitSkillEntry = { ...entry, base: { package: entry.base.package, ...to }, overlay: emptyOverlay(to.releaseDigest), compositionDigest: to.releaseDigest };
  if (d.choice === "keep-old") return [entry];
  if (d.choice === "use-upstream") {
    if (d.discardUserDelta !== true) throw releaseUnconfirmed(entry.identity);
    return [upstream];
  }
  if (d.choice === "edit-overlay") {
    if (typeof d.compositionDigest !== "string") throw badRequest(`${entry.identity}: edit-overlay needs overlay and compositionDigest`);
    return [{ ...upstream, overlay: validateOverlay(d.overlay, `${entry.identity}.overlay`), compositionDigest: d.compositionDigest }];
  }
  if (typeof d.forkIdentity !== "string" || typeof d.alias !== "string") throw badRequest(`${entry.identity}: fork needs forkIdentity and alias`);
  const { exposure: _e, ...rest } = entry;
  return [upstream, { ...rest, identity: d.forkIdentity, mode: "fork", alias: d.alias }];
}

const releaseUnconfirmed = (identity: string) =>
  conflict("kit.discard_unconfirmed", `${identity}: use-upstream drops your changes; confirm with discardUserDelta: true`);

/** `POST .../conflicts/:id/resolve` */
export async function resolveConflict(caller: KitCaller, kitName: string, id: string, body: Record<string, unknown>, generation: number, idempotencyKey: string): Promise<Response> {
  if (body.approvedBy !== "user") throw conflict("kit.approval_required", "a conflict is resolved only by the user's decision (approvedBy: \"user\")");
  const kit = await writableKit(caller.env.DB, kitName, caller.userId);
  const row = await loadConflict(caller, kit.id, id);
  if (row.status === "resolved" && row.resolved_revision_id !== null) {
    const done = await getRevision(caller.env.DB, kit.id, row.resolved_revision_id);
    if (done.idempotency_key === idempotencyKey) return json({ conflictId: row.id, reevalRequired: Number(row.reeval_required) === 1, revision: revisionView(done), generation: Number(kit.generation), warnings: [], replayed: true });
  }
  if (row.status !== "open") throw conflict("kit.conflict_closed", `the conflict is ${row.status}`);
  const suggestion = body.agentSuggestion ?? null;
  if (suggestion !== null && new TextEncoder().encode(JSON.stringify(suggestion)).length > MAX_SUGGESTION_BYTES) throw badRequest("agentSuggestion exceeds 16 KiB");
  const { report, candidates } = JSON.parse(row.report_json) as { report: RebaseReport; candidates: Record<string, KitSkillEntry> };
  const decisions = parseDecisions(body.decisions);
  const open = new Map(report.entries.filter((e) => e.status === "needs-review").map((e) => [e.identity, e]));
  for (const d of decisions) if (!open.has(d.identity)) throw badRequest(`${d.identity} has no open conflict`);
  for (const identity of open.keys()) if (!decisions.some((d) => d.identity === identity)) throw badRequest(`decide ${identity}`);

  const fromRow = await getRevision(caller.env.DB, kit.id, row.from_revision_id);
  // The from revision may have been quarantined or rejected since the rebase.
  assertSeedRevision(fromRow);
  const from = documentOf(fromRow);
  const skills = from.skills.flatMap((entry) => {
    const d = decisions.find((x) => x.identity === entry.identity);
    if (d === undefined) return [candidates[entry.identity] ?? entry];
    const to = open.get(entry.identity)!.to;
    if (to === null && d.choice !== "keep-old") throw conflict("kit.base_unavailable", `${entry.identity}: the upstream release is not available; keep-old is the only choice`);
    return applyDecision(entry, d, to ?? entry.base);
  });
  const doc: PersonalKitDocument = { ...withoutComposition(from), skills: skills.sort((a, b) => compareUtf8(a.identity, b.identity)) };
  const reeval = decisions.some((d) => d.choice !== "keep-old");
  const resolution = {
    schema: RESOLUTION_SCHEMA,
    conflictId: row.id,
    fromRevisionId: row.from_revision_id,
    approvedBy: "user",
    decisions: decisions.map((d) => ({ identity: d.identity, choice: d.choice, ...(d.discardUserDelta === true ? { discardUserDelta: true } : {}) })),
    agentSuggestion: suggestion,
    agentSuggestionApplied: false,
  };
  const at = caller.now.getTime();
  const closeSql = `UPDATE personal_kit_conflicts SET status = 'resolved', resolution_json = ?, resolved_by = ?, resolved_revision_id = ?,
                      reeval_required = ?, resolved_at = ? WHERE id = ? AND status = 'open' AND {guard}`;
  if ((await revisionDigest(doc)) === fromRow.revision_digest) {
    // Keeping everything old changes nothing: close the conflict onto the existing revision.
    const ok = await commitKitMutation(caller.env.DB, {
      kitId: kit.id,
      generation,
      statements: [{ sql: closeSql, binds: [JSON.stringify(resolution), caller.userId, fromRow.id, 0, at, row.id] }],
      audit: { actorKind: "user", actorId: caller.userId, action: "conflict.resolve", revisionId: fromRow.id, detail: row.id, at },
    });
    if (!ok) throw generationConflict();
    return json({ conflictId: row.id, reevalRequired: false, revision: revisionView(fromRow), generation: generation + 1, warnings: [], replayed: false });
  }
  const stored = await storeRevision(caller, {
    kitName,
    document: doc,
    expectedGeneration: generation,
    idempotencyKey,
    origin: "resolution",
    parentRevisionId: row.from_revision_id,
    action: "conflict.resolve",
    also: (revisionId) => [
      { sql: closeSql, binds: [JSON.stringify(resolution), caller.userId, revisionId, reeval ? 1 : 0, at, row.id] },
    ],
  });
  const res = storedResponse(stored);
  return json({ conflictId: row.id, reevalRequired: reeval, ...(await res.json()) as object }, res.status);
}
