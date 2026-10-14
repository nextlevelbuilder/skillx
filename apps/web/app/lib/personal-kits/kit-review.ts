/**
 * Review of session-derived proposals and operator quarantine.
 *
 * `POST .../revisions/:id/review` is the owner's decision on a `proposed`
 * revision: `reject` is final; `approve` needs an approval naming the exact
 * `revisionDigest`, exactly the declared permissions, `visibility:
 * "private"` and `consent: true`, and moves the revision to `reviewed` with
 * that proof in `approval_json`. Approval never activates. Review needs an
 * interactive web session: the API key that submits a proposal can never
 * approve it.
 *
 * `POST .../revisions/:id/quarantine` is operator-only (admin secret): any
 * revision can be quarantined; a quarantined effective revision makes the
 * lock read fail with `kit.locked_incompatible` until the owner activates or
 * rolls back to another revision.
 */
import { badRequest, conflict, json, kitNotFound, requireInteractive } from "./kit-http";
import type { KitCaller } from "./kit-http";
import { commitKitMutation, findKit, getRevision, ownedKit, writableKit } from "./kit-store";
import type { RevisionRow } from "./kit-store";
import { generationConflict } from "./kit-revisions";

interface ProposalRow {
  revision_id: string;
  identity: string;
  declared_permissions_json: string;
  required_permissions_json: string;
  evidence_json: string | null;
  scan_json: string;
  created_at: number;
}

async function proposalOf(db: D1Database, rev: RevisionRow): Promise<ProposalRow> {
  const row = await db.prepare("SELECT * FROM personal_kit_proposals WHERE revision_id = ?").bind(rev.id).first<ProposalRow>();
  if (row === null) throw conflict("kit.not_a_proposal", "the revision is not a session-derived proposal");
  return row;
}

/** `GET .../revisions/:id/proposal`: what the owner reviews (no content beyond the revision itself). */
export async function readProposalReview(caller: KitCaller, kitName: string, id: string): Promise<Response> {
  const kit = await ownedKit(caller.env.DB, kitName, caller.userId);
  const rev = await getRevision(caller.env.DB, kit.id, id);
  const row = await proposalOf(caller.env.DB, rev);
  const scan = JSON.parse(row.scan_json) as { findings: string[]; changedPaths: string[] };
  return json({
    revisionId: rev.id,
    revisionDigest: rev.revision_digest,
    state: rev.state,
    identity: row.identity,
    declaredPermissions: JSON.parse(row.declared_permissions_json),
    requiredPermissions: JSON.parse(row.required_permissions_json),
    evidence: row.evidence_json === null ? null : JSON.parse(row.evidence_json),
    findings: scan.findings,
    changedPaths: scan.changedPaths,
    generation: Number(kit.generation),
  });
}

const sameSet = (a: unknown, b: string[]) => Array.isArray(a) && a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** `POST .../revisions/:id/review` with `{expectedGeneration, decision, approval?}`. */
export async function reviewProposal(caller: KitCaller, kitName: string, id: string, body: Record<string, unknown>, generation: number): Promise<Response> {
  const kit = await writableKit(caller.env.DB, kitName, caller.userId);
  requireInteractive(caller);
  if (Number(kit.generation) !== generation) throw generationConflict();
  const rev = await getRevision(caller.env.DB, kit.id, id);
  const row = await proposalOf(caller.env.DB, rev);
  if (rev.state !== "proposed") throw conflict("kit.revision_unusable", `the revision is ${rev.state}`);
  const at = caller.now.getTime();
  let sql: string;
  let binds: unknown[];
  if (body.decision === "reject") {
    if (body.approval !== undefined) throw badRequest("a rejection takes no approval");
    sql = "UPDATE personal_kit_revisions SET state = 'rejected', rejected_at = ? WHERE id = ? AND state = 'proposed' AND {guard}";
    binds = [at, rev.id];
  } else if (body.decision === "approve") {
    const declared = JSON.parse(row.declared_permissions_json) as string[];
    const a = (typeof body.approval === "object" && body.approval !== null ? body.approval : {}) as Record<string, unknown>;
    if (a.revisionDigest !== rev.revision_digest || !sameSet(a.permissions, declared) || a.visibility !== "private" || a.consent !== true) {
      throw conflict("kit.approval_required", "approval must name the exact revisionDigest, exactly the declared permissions, visibility \"private\" and consent: true");
    }
    const proof = JSON.stringify({ approvedBy: "user", userId: caller.userId, credential: "web-session", revisionDigest: rev.revision_digest, permissions: [...declared].sort(), visibility: "private", consent: true, at: new Date(at).toISOString(), action: "review" });
    sql = "UPDATE personal_kit_revisions SET state = 'reviewed', reviewed_at = ?, approval_json = ? WHERE id = ? AND state = 'proposed' AND {guard}";
    binds = [at, proof, rev.id];
  } else {
    throw badRequest("decision must be \"approve\" or \"reject\"");
  }
  const decision = body.decision as string;
  const ok = await commitKitMutation(caller.env.DB, {
    kitId: kit.id,
    generation,
    statements: [{ sql, binds }],
    audit: { actorKind: "user", actorId: caller.userId, action: `proposal.${decision}`, revisionId: rev.id, detail: row.identity, at },
  });
  if (!ok) throw generationConflict();
  return json({ revisionId: rev.id, state: decision === "approve" ? "reviewed" : "rejected", generation: generation + 1 });
}

/** `POST .../revisions/:id/quarantine` with `{reason?}` (operator only). */
export async function quarantineRevision(caller: KitCaller, kitName: string, id: string, reason: unknown): Promise<Response> {
  if (reason !== undefined && (typeof reason !== "string" || reason.length > 500)) throw badRequest("reason must be a string of at most 500 characters");
  const kit = await findKit(caller.env.DB, kitName);
  if (kit === null) throw kitNotFound();
  const rev = await getRevision(caller.env.DB, kit.id, id);
  if (rev.state === "quarantined") throw conflict("kit.revision_unusable", "the revision is already quarantined");
  const at = caller.now.getTime();
  const generation = Number(kit.generation);
  const ok = await commitKitMutation(caller.env.DB, {
    kitId: kit.id,
    generation,
    statements: [{ sql: "UPDATE personal_kit_revisions SET state = 'quarantined', quarantined_at = ? WHERE id = ? AND {guard}", binds: [at, rev.id] }],
    audit: { actorKind: "admin", actorId: caller.userId, action: "revision.quarantine", revisionId: rev.id, detail: (reason as string | undefined) ?? rev.state, at },
  });
  if (!ok) throw generationConflict();
  return json({ revisionId: rev.id, state: "quarantined", effective: rev.id === kit.effective_revision_id, generation: generation + 1 });
}
