/**
 * Foundation rebase of a kit revision onto newer base releases. The engine
 * (`rebaseOverlay`) is deterministic and never picks a side; the server adds
 * the categories only it can see (`conflict.entitlement`,
 * `conflict.revoked_base`, `conflict.ambiguous_provider`). `preview-update`
 * is read-only. `rebase` stores a clean result as a draft `rebase` revision
 * (never activated automatically) and anything else as an open conflict
 * whose report holds categories, paths and digests, never file content.
 * A repeated `idempotencyKey` replays the stored revision or conflict before
 * the generation is checked, so a retry after a lost answer is not a 409.
 */
import { canonicalJson, compareUtf8, rebaseOverlay } from "@skillx/contracts";
import type { KitSkillEntry, PersonalKitDocument, RebaseFinding } from "@skillx/contracts";
import { baseFailure, loadPinnedBase, loadUpstream } from "./base-loader";
import { badRequest, conflict, json } from "./kit-http";
import type { KitCaller } from "./kit-http";
import {
  assertSeedRevision,
  commitKitMutation,
  documentOf,
  getRevision,
  newId,
  ownedKit,
  revisionByIdempotency,
  revisionView,
  writableKit,
} from "./kit-store";
import type { KitRow, RevisionRow } from "./kit-store";
import { generationConflict, storeRevision, storedResponse, withoutComposition } from "./kit-revisions";

export const REBASE_REPORT_SCHEMA = "skillx.kit-rebase-report/v1";
const MAX_UPDATES = 128;

export interface Update {
  package: string;
  version: string;
}

export interface EntryReport {
  identity: string;
  from: { version: string; releaseDigest: string };
  to: { version: string; releaseDigest: string } | null;
  status: "clean" | "needs-review" | "unchanged" | "skipped";
  findings: RebaseFinding[];
}

export interface RebaseReport {
  schema: typeof REBASE_REPORT_SCHEMA;
  fromRevisionId: string;
  status: "clean" | "needs-review";
  entries: EntryReport[];
}

export function parseUpdates(raw: unknown): Update[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_UPDATES) throw badRequest(`updates must hold 1 to ${MAX_UPDATES} {package, version} items`);
  return raw.map((u, i) => {
    if (typeof u !== "object" || u === null || typeof u.package !== "string" || typeof u.version !== "string" || Object.keys(u).length !== 2) {
      throw badRequest(`updates[${i}] must be {package, version}`);
    }
    return { package: u.package, version: u.version };
  });
}

const stop = (category: RebaseFinding["category"], detail: string): RebaseFinding[] => [{ category, path: "", detail }];

async function rebaseEntry(caller: KitCaller, entry: KitSkillEntry, update: Update, ambiguous: boolean): Promise<{ report: EntryReport; next: KitSkillEntry | null }> {
  const from = { version: entry.base.version, releaseDigest: entry.base.releaseDigest };
  const review = (findings: RebaseFinding[], to: EntryReport["to"] = null) => ({ report: { identity: entry.identity, from, to, status: "needs-review" as const, findings }, next: null });
  if (ambiguous) return review(stop("conflict.ambiguous_provider", `${update.package} is named with more than one target version`));
  const load = async (fn: () => ReturnType<typeof loadPinnedBase>) => {
    try {
      return await fn();
    } catch (error) {
      const failure = baseFailure(error);
      if (failure === null) throw error;
      return failure;
    }
  };
  const old = await load(() => loadPinnedBase(caller.env, caller.userId, entry.base, caller.bases));
  if (typeof old === "string") return review(stop(old === "entitlement" ? "conflict.entitlement" : "conflict.revoked_base", `the current base is ${old}`));
  const upstream = await load(() => loadUpstream(caller.env, caller.userId, update.package, update.version, caller.bases));
  if (typeof upstream === "string") return review(stop(upstream === "entitlement" ? "conflict.entitlement" : "conflict.revoked_base", `${update.package}@${update.version} is ${upstream}`));
  const to = { version: upstream.release.version, releaseDigest: upstream.release.releaseDigest };
  if (to.releaseDigest === from.releaseDigest) return { report: { identity: entry.identity, from, to, status: "unchanged", findings: [] }, next: null };
  const result = await rebaseOverlay(old.tree, upstream.tree, entry.overlay);
  if (result.status === "needs-review") return review(result.findings, to);
  const next = { ...entry, base: { package: update.package, ...to }, overlay: result.overlay, compositionDigest: result.compositionDigest };
  return { report: { identity: entry.identity, from, to, status: "clean", findings: result.findings }, next };
}

/** Rebases every entry of `doc` whose base package is named in `updates`. */
export async function computeRebase(caller: KitCaller, from: RevisionRow, updates: Update[], includeForks: boolean) {
  const doc = documentOf(from);
  const versions = new Map<string, Set<string>>();
  for (const u of updates) versions.set(u.package, (versions.get(u.package) ?? new Set()).add(u.version));
  const entries: EntryReport[] = [];
  const candidates: Record<string, KitSkillEntry> = {};
  for (const entry of doc.skills) {
    const named = versions.get(entry.base.package);
    if (named === undefined) continue;
    if (entry.mode === "fork" && !includeForks) {
      entries.push({ identity: entry.identity, from: { version: entry.base.version, releaseDigest: entry.base.releaseDigest }, to: null, status: "skipped", findings: [] });
      continue;
    }
    const { report, next } = await rebaseEntry(caller, entry, { package: entry.base.package, version: [...named][0]! }, named.size > 1);
    entries.push(report);
    if (next !== null) candidates[entry.identity] = next;
  }
  if (entries.length === 0) throw badRequest("no kit entry uses a package named in updates");
  const report: RebaseReport = { schema: REBASE_REPORT_SCHEMA, fromRevisionId: from.id, status: entries.some((e) => e.status === "needs-review") ? "needs-review" : "clean", entries };
  const candidate: PersonalKitDocument = { ...withoutComposition(doc), skills: doc.skills.map((s) => candidates[s.identity] ?? s) };
  return { report, candidates, candidate };
}

/** The revision a rebase starts from; an unreviewed, rejected or quarantined one is refused like a proposal's. */
async function fromRevision(caller: KitCaller, kit: KitRow, raw: unknown): Promise<RevisionRow> {
  const id = raw ?? kit.effective_revision_id;
  if (typeof id !== "string") throw badRequest("fromRevisionId is required while the kit has no effective revision");
  const from = await getRevision(caller.env.DB, kit.id, id);
  assertSeedRevision(from);
  return from;
}

/** Canonical form of what a rebase request asks for besides its from revision (sorted updates, includeForks). */
const requestKey = (updates: Update[], includeForks: boolean) =>
  canonicalJson({ includeForks, updates: [...updates].sort((a, b) => compareUtf8(a.package, b.package) || compareUtf8(a.version, b.version)) });

/** Audit action of the row that records the request of a clean rebase revision. */
const REQUEST_ACTION = "rebase.request";

/** `POST .../preview-update`: the report only; nothing is written. */
export async function previewUpdate(caller: KitCaller, kitName: string, body: Record<string, unknown>): Promise<Response> {
  const kit = await ownedKit(caller.env.DB, kitName, caller.userId);
  const from = await fromRevision(caller, kit, body.fromRevisionId);
  const { report } = await computeRebase(caller, from, parseUpdates(body.updates), body.includeForks === true);
  return json({ report, generation: Number(kit.generation) });
}

/** `POST .../rebase`: a clean result becomes a draft revision, anything else an open conflict. */
const idempotencyConflict = () => conflict("kit.idempotency_conflict", "idempotencyKey was already used for a different request");

/** The stored answer of an earlier rebase with the same key, or null. */
async function replayRebase(caller: KitCaller, kit: KitRow, body: Record<string, unknown>, idempotencyKey: string, request: string): Promise<Response | null> {
  const db = caller.env.DB;
  const generation = Number(kit.generation);
  const sameFrom = (fromId: string | null) => body.fromRevisionId === undefined || body.fromRevisionId === fromId;
  const rev = await revisionByIdempotency(db, kit.id, idempotencyKey);
  if (rev !== null) {
    if (rev.origin !== "rebase" || !sameFrom(rev.parent_revision_id)) throw idempotencyConflict();
    const recorded = await db
      .prepare("SELECT detail FROM personal_kit_audit WHERE kit_id = ? AND revision_id = ? AND action = ? LIMIT 1")
      .bind(kit.id, rev.id, REQUEST_ACTION)
      .first<{ detail: string | null }>();
    if (recorded?.detail !== request) throw idempotencyConflict();
    return json({ status: "clean", revision: revisionView(rev), generation, warnings: [], replayed: true });
  }
  const row = await db
    .prepare("SELECT id, from_revision_id, report_json FROM personal_kit_conflicts WHERE kit_id = ? AND idempotency_key = ?")
    .bind(kit.id, idempotencyKey)
    .first<{ id: string; from_revision_id: string; report_json: string }>();
  if (row === null) return null;
  const stored = JSON.parse(row.report_json) as { report: RebaseReport; request?: string };
  if (!sameFrom(row.from_revision_id) || stored.request !== request) throw idempotencyConflict();
  return json({ status: "needs-review", conflictId: row.id, report: stored.report, generation, replayed: true });
}

export async function rebaseKit(caller: KitCaller, kitName: string, body: Record<string, unknown>, generation: number, idempotencyKey: string): Promise<Response> {
  const kit = await writableKit(caller.env.DB, kitName, caller.userId);
  const updates = parseUpdates(body.updates);
  const includeForks = body.includeForks === true;
  const request = requestKey(updates, includeForks);
  const replay = await replayRebase(caller, kit, body, idempotencyKey, request);
  if (replay !== null) return replay;
  if (Number(kit.generation) !== generation) throw generationConflict();
  const from = await fromRevision(caller, kit, body.fromRevisionId);
  const { report, candidates, candidate } = await computeRebase(caller, from, updates, includeForks);
  if (report.status === "clean") {
    if (Object.keys(candidates).length === 0) return json({ status: "unchanged", report, generation });
    const stored = await storeRevision(caller, {
      kitName,
      document: candidate,
      expectedGeneration: generation,
      idempotencyKey,
      origin: "rebase",
      parentRevisionId: from.id,
      // Records what was asked, so a reused key with other updates is an idempotency conflict, not a replay.
      also: (revisionId) => [
        {
          sql: `INSERT INTO personal_kit_audit (id, kit_id, actor_kind, actor_id, action, revision_id, detail, created_at)
                SELECT ?, ?, 'user', ?, ?, ?, ?, ? WHERE {guard}`,
          binds: [newId("pka"), kit.id, caller.userId, REQUEST_ACTION, revisionId, request, caller.now.getTime()],
        },
      ],
    });
    const res = storedResponse(stored);
    return json({ status: "clean", report, ...(await res.json()) as object }, res.status);
  }
  const conflictId = newId("pkc");
  const at = caller.now.getTime();
  const ok = await commitKitMutation(caller.env.DB, {
    kitId: kit.id,
    generation,
    statements: [
      {
        sql: `INSERT INTO personal_kit_conflicts (id, kit_id, from_revision_id, report_json, status, idempotency_key, created_at)
              SELECT ?, ?, ?, ?, 'open', ?, ? WHERE {guard}`,
        binds: [conflictId, kit.id, from.id, JSON.stringify({ report, candidates, request }), idempotencyKey, at],
      },
      // A newer conflict supersedes every older open one of the kit.
      { sql: "UPDATE personal_kit_conflicts SET status = 'superseded' WHERE kit_id = ? AND status = 'open' AND id <> ? AND {guard}", binds: [kit.id, conflictId] },
    ],
    audit: { actorKind: "user", actorId: caller.userId, action: "rebase.conflict", revisionId: from.id, detail: conflictId, at },
  });
  if (!ok) throw generationConflict();
  return json({ status: "needs-review", conflictId, report, generation: generation + 1, replayed: false });
}
