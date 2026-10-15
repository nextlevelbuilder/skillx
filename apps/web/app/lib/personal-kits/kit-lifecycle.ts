/**
 * Revision lifecycle and the lock. Activation (and rollback, which
 * re-activates an earlier revision) needs the user's approval naming the
 * exact `revisionDigest`, re-checks every base of the effective lineage and
 * moves `effective_revision_id` under the generation guard; nothing becomes
 * effective implicitly. A proposal (`proposed`) must be reviewed first, and
 * a revision with a session-derived revision anywhere in its history (its
 * revision chain, any origin, and the revision chain of every parent revision
 * its document lineage names; an unreadable parent counts) activates only on a private kit,
 * as a private document, and only from an interactive web session. Any
 * activation that makes a kit public needs a web session too. A quarantined revision anywhere in the chain
 * fails the lock with `kit.locked_incompatible`.
 * Rejection is final for that revision; a proposal is rejected only through
 * its web-session review, never through the generic reject. The lock is derived on read from the
 * immutable documents, so equal revisions always give equal lock bytes;
 * ancestors owned by someone else are returned as digest references only.
 */
import { buildKitLock, resolveLineage } from "@skillx/contracts";
import { releaseError } from "~/lib/releases/release-http";
import { baseFailure, loadPinnedBase } from "./base-loader";
import { badRequest, conflict, json, kitNotFound, requireId, requireInteractive } from "./kit-http";
import type { KitCaller } from "./kit-http";
import { commitKitMutation, documentOf, getRevision, ownedKit, writableKit } from "./kit-store";
import type { KitRow, RevisionRow } from "./kit-store";
import { chainView, loadChain } from "./kit-verify";
import type { LoadedChain } from "./kit-verify";
import { generationConflict } from "./kit-revisions";

const ACTIVATABLE = new Set(["draft", "reviewed"]);

interface LockCheck {
  /** Null when the lineage is incomplete; `reasons` then says why. */
  lock: Awaited<ReturnType<typeof buildKitLock>> | null;
  /** The parent revisions the document lineage loaded. */
  parents: LoadedChain["parents"];
  documents: unknown[];
  reasons: string[];
  warnings: string[];
}

/** Builds the lock of `rev` and re-checks each pinned base for the owner. */
export async function checkLock(caller: KitCaller, rev: RevisionRow): Promise<LockCheck> {
  const reasons: string[] = rev.state === "quarantined" ? ["the revision is quarantined"] : [];
  const loaded = await loadChain(caller, documentOf(rev), reasons);
  if (loaded.incomplete) return { lock: null, parents: loaded.parents, documents: [], reasons, warnings: [] };
  const { chain } = loaded;
  const warnings: string[] = [];
  for (const { entry } of resolveLineage(chain)) {
    try {
      const base = await loadPinnedBase(caller.env, caller.userId, entry.base, caller.bases);
      if (base.release.state === "yanked") warnings.push(`${entry.base.package}@${entry.base.version} is yanked`);
    } catch (error) {
      const failure = baseFailure(error);
      if (failure === null) throw error;
      reasons.push(`${entry.identity}: base ${entry.base.package}@${entry.base.version} is ${failure}`);
    }
  }
  const lock = await buildKitLock(chain, { id: rev.id, number: Number(rev.revision_number), digest: rev.revision_digest });
  return { lock, parents: loaded.parents, documents: chainView(loaded), reasons, warnings };
}

/** 409 with the failing pins listed in `error.reasons`. */
const incompatible = (reasons: string[]) =>
  json({ error: { code: "kit.locked_incompatible", message: "the revision pins a base that is no longer available", reasons } }, 409);

function requireApproval(raw: unknown, rev: RevisionRow): void {
  const digest = typeof raw === "object" && raw !== null ? (raw as { revisionDigest?: unknown }).revisionDigest : undefined;
  if (digest !== rev.revision_digest) throw conflict("kit.approval_required", "approval.revisionDigest must name the exact revision being activated");
}

/**
 * True when `rev` or any revision in its parent chain, whatever its origin,
 * is session-derived: it inherits the web-session activation gate. A parent
 * that cannot be read (missing, or in another kit) counts as session-derived,
 * so the check fails closed.
 */
async function derivesFromSession(db: D1Database, kitId: string, rev: RevisionRow): Promise<boolean> {
  if (rev.origin === "session-derived") return true;
  const row = await db
    .prepare(
      `WITH RECURSIVE chain(id, origin, parent) AS (
         SELECT id, origin, parent_revision_id FROM personal_kit_revisions WHERE id = ? AND kit_id = ?
         UNION
         SELECT r.id, r.origin, r.parent_revision_id FROM personal_kit_revisions r JOIN chain c ON r.id = c.parent WHERE r.kit_id = ?)
       SELECT COUNT(*) AS n,
              COALESCE(SUM(origin = 'session-derived'), 0) AS tainted,
              COALESCE(SUM(parent IS NOT NULL AND parent NOT IN (SELECT id FROM chain)), 0) AS dangling
         FROM chain`,
    )
    .bind(rev.id, kitId, kitId)
    .first<{ n: number; tainted: number; dangling: number }>();
  return row === null || Number(row.n) === 0 || Number(row.tainted) > 0 || Number(row.dangling) > 0;
}

/** `POST .../activate` and `POST .../rollback` (rollback: a revision that was effective before). */
export async function activateRevision(caller: KitCaller, kitName: string, body: Record<string, unknown>, generation: number, rollback: boolean): Promise<Response> {
  const kit = await writableKit(caller.env.DB, kitName, caller.userId);
  if (Number(kit.generation) !== generation) throw generationConflict();
  const rev = await getRevision(caller.env.DB, kit.id, requireId(body.revisionId, "revisionId"));
  requireApproval(body.approval, rev);
  if (rev.state === "proposed") throw conflict("kit.review_required", "a proposed revision must be reviewed before activation");
  if (!ACTIVATABLE.has(rev.state)) throw conflict("kit.revision_unusable", `the revision is ${rev.state}`);
  const sessionDerived = rev.origin === "session-derived";
  if (sessionDerived && rev.state !== "reviewed") throw conflict("kit.review_required", "a session-derived revision must be reviewed");
  const doc = documentOf(rev);
  // The lock loads the document lineage: a parent revision in another kit carries its own history.
  const check = await checkLock(caller, rev);
  const histories = [{ kitId: kit.id, row: rev }, ...check.parents];
  let gated = false;
  for (const { kitId, row } of histories) if (!gated) gated = await derivesFromSession(caller.env.DB, kitId, row);
  if (gated) {
    requireInteractive(caller);
    // Both the kit and the visibility the activation writes stay private; a public kit is forked to a private one instead.
    if (kit.visibility !== "private" || doc.visibility !== "private") {
      throw conflict("proposal.private_kit_required", "a revision derived from a session-derived revision activates on a private kit, as a private document, only");
    }
  }
  // Publishing is a human decision whatever the origin: an API key never makes a kit public.
  if (doc.visibility !== "private") requireInteractive(caller, "activate a public revision signed in on the web, not with an API key");
  if (rollback && (rev.activated_at === null || rev.id === kit.effective_revision_id)) throw badRequest("rollback targets an earlier effective revision");
  if (!rollback && rev.id === kit.effective_revision_id) throw badRequest("the revision is already effective");
  // A parent that could not be loaded fails here, so the gate never trusts a lineage it did not read.
  if (check.reasons.length > 0) return incompatible(check.reasons);
  const at = caller.now.getTime();
  // A reviewed proposal keeps its review proof next to the activation approval.
  const review = sessionDerived && rev.approval_json !== null ? (JSON.parse(rev.approval_json) as { review?: unknown }) : null;
  const approval = JSON.stringify({
    approvedBy: "user",
    userId: caller.userId,
    credential: caller.interactive ? "web-session" : "api-key",
    revisionDigest: rev.revision_digest,
    at: new Date(at).toISOString(),
    action: rollback ? "rollback" : "activate",
    ...(review === null ? {} : { review: review.review ?? review }),
  });
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
  const kit: KitRow = await writableKit(caller.env.DB, kitName, caller.userId);
  if (Number(kit.generation) !== generation) throw generationConflict();
  const rev = await getRevision(caller.env.DB, kit.id, id);
  if (rev.id === kit.effective_revision_id) throw conflict("kit.revision_effective", "the effective revision cannot be rejected; activate another one first");
  if (rev.state !== "draft" && rev.state !== "proposed") throw conflict("kit.revision_unusable", `the revision is ${rev.state}`);
  // A proposal is decided by a human in a web session, through `/review` only.
  if (rev.state === "proposed" || rev.origin === "session-derived") {
    throw releaseError(403, "kit.interactive_approval_required", "reject a session-derived proposal through its review, signed in on the web");
  }
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
