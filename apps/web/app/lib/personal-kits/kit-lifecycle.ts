/**
 * Revision lifecycle and the lock. Activation (and rollback, which
 * re-activates an earlier revision) needs the user's approval naming the
 * exact `revisionDigest`, re-checks every base of the effective lineage and
 * moves `effective_revision_id` under the generation guard; nothing becomes
 * effective implicitly. A proposal (`proposed`) must be reviewed first.
 * Rejection is final for that revision. The lock is derived on read from the
 * immutable documents, so equal revisions always give equal lock bytes.
 */
import { buildKitLock, resolveLineage } from "@skillx/contracts";
import { baseFailure, loadPinnedBase } from "./base-loader";
import { badRequest, conflict, json, kitNotFound, requireId } from "./kit-http";
import type { KitCaller } from "./kit-http";
import { commitKitMutation, documentOf, getRevision, ownedKit } from "./kit-store";
import type { KitRow, RevisionRow } from "./kit-store";
import { loadChain } from "./kit-verify";
import { generationConflict } from "./kit-revisions";

const ACTIVATABLE = new Set(["draft", "reviewed"]);

interface LockCheck {
  lock: Awaited<ReturnType<typeof buildKitLock>>;
  documents: unknown[];
  reasons: string[];
  warnings: string[];
}

/** Builds the lock of `rev` and re-checks each pinned base for the owner. */
export async function checkLock(caller: KitCaller, rev: RevisionRow): Promise<LockCheck> {
  const { chain } = await loadChain(caller.env, caller.userId, documentOf(rev));
  const reasons: string[] = [];
  const warnings: string[] = [];
  for (const { entry } of resolveLineage(chain)) {
    try {
      const base = await loadPinnedBase(caller.env, caller.userId, entry.base);
      if (base.release.state === "yanked") warnings.push(`${entry.base.package}@${entry.base.version} is yanked`);
    } catch (error) {
      const failure = baseFailure(error);
      if (failure === null) throw error;
      reasons.push(`${entry.identity}: base ${entry.base.package}@${entry.base.version} is ${failure}`);
    }
  }
  const lock = await buildKitLock(chain, { id: rev.id, number: Number(rev.revision_number), digest: rev.revision_digest });
  return { lock, documents: chain, reasons, warnings };
}

/** 409 with the failing pins listed in `error.reasons`. */
const incompatible = (reasons: string[]) =>
  json({ error: { code: "kit.locked_incompatible", message: "the revision pins a base that is no longer available", reasons } }, 409);

function requireApproval(raw: unknown, rev: RevisionRow): void {
  const digest = typeof raw === "object" && raw !== null ? (raw as { revisionDigest?: unknown }).revisionDigest : undefined;
  if (digest !== rev.revision_digest) throw conflict("kit.approval_required", "approval.revisionDigest must name the exact revision being activated");
}

/** `POST .../activate` and `POST .../rollback` (rollback: a revision that was effective before). */
export async function activateRevision(caller: KitCaller, kitName: string, body: Record<string, unknown>, generation: number, rollback: boolean): Promise<Response> {
  const kit = await ownedKit(caller.env.DB, kitName, caller.userId);
  if (Number(kit.generation) !== generation) throw generationConflict();
  const rev = await getRevision(caller.env.DB, kit.id, requireId(body.revisionId, "revisionId"));
  requireApproval(body.approval, rev);
  if (rev.state === "proposed") throw conflict("kit.review_required", "a proposed revision must be reviewed before activation");
  if (!ACTIVATABLE.has(rev.state)) throw conflict("kit.revision_unusable", `the revision is ${rev.state}`);
  if (rev.origin === "session-derived" && rev.state !== "reviewed") throw conflict("kit.review_required", "a session-derived revision must be reviewed");
  if (rollback && (rev.activated_at === null || rev.id === kit.effective_revision_id)) throw badRequest("rollback targets an earlier effective revision");
  if (!rollback && rev.id === kit.effective_revision_id) throw badRequest("the revision is already effective");
  const check = await checkLock(caller, rev);
  if (check.reasons.length > 0) return incompatible(check.reasons);
  const doc = documentOf(rev);
  const at = caller.now.getTime();
  const approval = JSON.stringify({ approvedBy: "user", userId: caller.userId, revisionDigest: rev.revision_digest, at: new Date(at).toISOString(), action: rollback ? "rollback" : "activate" });
  const ok = await commitKitMutation(caller.env.DB, {
    kitId: kit.id,
    generation,
    statements: [
      {
        sql: `UPDATE personal_kit_revisions SET activated_at = COALESCE(activated_at, ?), approval_json = ?,
                state = 'reviewed', reviewed_at = COALESCE(reviewed_at, ?) WHERE id = ? AND {guard}`,
        binds: [at, approval, at, rev.id],
      },
    ],
    kitSet: ", effective_revision_id = ?, visibility = ?, local_id = COALESCE(?, local_id)",
    kitBinds: [rev.id, doc.visibility, doc.localId ?? null],
    audit: { actorKind: "user", actorId: caller.userId, action: rollback ? "revision.rollback" : "revision.activate", revisionId: rev.id, detail: kit.effective_revision_id, at },
  });
  if (!ok) throw generationConflict();
  return json({ effectiveRevisionId: rev.id, generation: generation + 1, lock: check.lock, warnings: check.warnings });
}

/** `POST .../revisions/:id/reject` */
export async function rejectRevision(caller: KitCaller, kitName: string, id: string, generation: number): Promise<Response> {
  const kit: KitRow = await ownedKit(caller.env.DB, kitName, caller.userId);
  if (Number(kit.generation) !== generation) throw generationConflict();
  const rev = await getRevision(caller.env.DB, kit.id, id);
  if (rev.id === kit.effective_revision_id) throw conflict("kit.revision_effective", "the effective revision cannot be rejected; activate another one first");
  if (rev.state !== "draft" && rev.state !== "proposed") throw conflict("kit.revision_unusable", `the revision is ${rev.state}`);
  const at = caller.now.getTime();
  const ok = await commitKitMutation(caller.env.DB, {
    kitId: kit.id,
    generation,
    statements: [{ sql: "UPDATE personal_kit_revisions SET state = 'rejected', rejected_at = ? WHERE id = ? AND {guard}", binds: [at, rev.id] }],
    audit: { actorKind: "user", actorId: caller.userId, action: "revision.reject", revisionId: rev.id, detail: rev.state, at },
  });
  if (!ok) throw generationConflict();
  return json({ revisionId: rev.id, state: "rejected", generation: generation + 1 });
}

/** `GET .../lock[?revision=<id>]`: the lock of the effective (or named) revision and its documents. */
export async function readLock(caller: KitCaller, kitName: string, revisionId: string | null): Promise<Response> {
  const kit = await ownedKit(caller.env.DB, kitName, caller.userId);
  const id = revisionId ?? kit.effective_revision_id;
  if (id === null) throw kitNotFound();
  const check = await checkLock(caller, await getRevision(caller.env.DB, kit.id, id));
  if (check.reasons.length > 0) return incompatible(check.reasons);
  return json({ lock: check.lock, documents: check.documents, warnings: check.warnings });
}
