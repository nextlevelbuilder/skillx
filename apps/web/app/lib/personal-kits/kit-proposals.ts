/**
 * Session-derived proposals (`POST .../proposals[/validate]`). A proposal
 * replaces one skill's overlay of an existing revision (same pinned base),
 * becomes a private `session-derived` revision in state `proposed` (or
 * `quarantined` when the scan finds danger) and never activates: the owner
 * reviews it (`revisions/:id/review`) and then activates it as usual.
 *
 * Refused with nothing stored: a public kit (fork it to a private kit), a
 * from-revision that is itself an unreviewed proposal, raw session fields, a
 * public visibility, a secret, absolute local path, binary or BOM content in
 * what the change introduces or in the evidence, and declared permissions
 * that differ from those the change requires. `validate` runs every check,
 * including the server-side composition, and writes nothing.
 */
import { canonicalJson, revisionDigest, validateKitDocument } from "@skillx/contracts";
import type { PersonalKitDocument } from "@skillx/contracts";
import { DetailedKitError, conflict, json, requireGeneration, requireIdempotencyKey } from "./kit-http";
import type { KitCaller } from "./kit-http";
import { assertSeedRevision, documentOf, getRevision, writableKit } from "./kit-store";
import type { KitRow, RevisionRow } from "./kit-store";
import { storeRevision, storedResponse } from "./kit-revisions";
import { verifyDocument } from "./kit-verify";
import type { VerifiedDocument } from "./kit-verify";
import { proposalError, readProposal } from "./proposal-envelope";
import type { KitProposal } from "./proposal-envelope";
import { scanProposal } from "./proposal-scan";
import type { ProposalScan } from "./proposal-scan";

interface Prepared {
  kit: KitRow;
  from: RevisionRow;
  proposal: KitProposal;
  document: PersonalKitDocument;
  fromOverlay: PersonalKitDocument["skills"][number]["overlay"];
}

/** Resolves the proposal against its from-revision and builds the new private document. */
async function prepare(caller: KitCaller, kitName: string, raw: unknown): Promise<Prepared> {
  const kit = await writableKit(caller.env.DB, kitName, caller.userId);
  if (kit.visibility !== "private") {
    throw conflict("proposal.private_kit_required", "session-derived proposals apply to private kits only; fork this kit to a private kit first");
  }
  const proposal = readProposal(raw);
  const from = await getRevision(caller.env.DB, kit.id, proposal.fromRevisionId);
  assertSeedRevision(from);
  const fromDoc = documentOf(from);
  const index = fromDoc.skills.findIndex((s) => s.identity === proposal.skill.identity);
  if (index < 0) throw proposalError("proposal.unknown_skill", `${proposal.skill.identity} is not in the from revision`);
  const entry = fromDoc.skills[index]!;
  if (canonicalJson(entry.base) !== canonicalJson(proposal.skill.base)) {
    throw proposalError("proposal.base_mismatch", "proposal.skill.base must equal the base the from revision pins; rebase the kit to move a base");
  }
  const skills = [...fromDoc.skills];
  skills[index] = { ...entry, overlay: proposal.skill.overlay, compositionDigest: proposal.skill.compositionDigest };
  const document = validateKitDocument({ ...fromDoc, visibility: "private", skills });
  return { kit, from, proposal, document, fromOverlay: entry.overlay };
}

/** Scans the change and enforces the declared permissions; throws on a refusal. */
async function assess(p: Prepared, verified: VerifiedDocument): Promise<ProposalScan> {
  const base = verified.bases.get(p.proposal.skill.identity)!;
  const scan = await scanProposal(base.tree, p.fromOverlay, p.proposal.skill.overlay, p.proposal.evidence?.summary ?? null);
  if (scan.refusing.length > 0) {
    throw new DetailedKitError(422, "proposal.content_refused", "the proposal contains a secret or an absolute local path; redact it and retry", { findings: scan.refusing });
  }
  const declared = p.proposal.declaredPermissions;
  const missing = scan.required.filter((r) => !declared.includes(r));
  if (missing.length > 0) {
    throw new DetailedKitError(422, "proposal.undeclared_permission", "the change needs permissions the proposal does not declare", { required: scan.required, missing });
  }
  // The owner approves exactly what the change needs, never a broader grant.
  const extra = declared.filter((d) => !scan.required.includes(d));
  if (extra.length > 0) {
    throw new DetailedKitError(422, "proposal.excess_permission", "the proposal declares permissions the change does not need", { required: scan.required, extra });
  }
  return scan;
}

const stateOf = (scan: ProposalScan) => (scan.quarantining.length > 0 ? "quarantined" : "proposed");

/** `POST .../proposals/validate`: every check, nothing written. */
export async function validateProposal(caller: KitCaller, kitName: string, body: Record<string, unknown>): Promise<Response> {
  const p = await prepare(caller, kitName, body.proposal);
  const verified = await verifyDocument(caller, kitName, p.document);
  const scan = await assess(p, verified);
  const generation = Number(p.kit.generation);
  const expected = body.expectedGeneration === undefined ? null : requireGeneration(body.expectedGeneration);
  return json({
    valid: true,
    state: stateOf(scan),
    revisionDigest: await revisionDigest(p.document),
    compositionDigest: p.proposal.skill.compositionDigest,
    requiredPermissions: scan.required,
    declaredPermissions: p.proposal.declaredPermissions,
    findings: scan.quarantining,
    changedPaths: scan.changed,
    generation,
    generationConflict: expected !== null && expected !== generation,
    warnings: verified.warnings,
  });
}

/** `POST .../proposals`: stores the proposal revision and its review metadata atomically. */
export async function submitProposal(caller: KitCaller, kitName: string, body: Record<string, unknown>): Promise<Response> {
  const expectedGeneration = requireGeneration(body.expectedGeneration);
  const idempotencyKey = requireIdempotencyKey(body.idempotencyKey);
  const p = await prepare(caller, kitName, body.proposal);
  let scan: ProposalScan | null = null;
  const stored = await storeRevision(caller, {
    kitName,
    document: p.document,
    expectedGeneration,
    idempotencyKey,
    origin: "session-derived",
    parentRevisionId: p.from.id,
    action: "proposal.submit",
    check: async (_doc, _kit, verified) => {
      scan = await assess(p, verified);
      return { state: stateOf(scan) };
    },
    also: (revisionId) => {
      const s = scan!;
      return [
        {
          sql: `INSERT INTO personal_kit_proposals (revision_id, kit_id, identity, declared_permissions_json, required_permissions_json, evidence_json, scan_json, created_at)
                SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE {guard}`,
          binds: [
            revisionId, p.kit.id, p.proposal.skill.identity, JSON.stringify(p.proposal.declaredPermissions), JSON.stringify(s.required),
            p.proposal.evidence === null ? null : canonicalJson(p.proposal.evidence), JSON.stringify({ findings: s.quarantining, changedPaths: s.changed }),
            caller.now.getTime(),
          ],
        },
      ];
    },
  });
  return storedResponse(stored);
}
