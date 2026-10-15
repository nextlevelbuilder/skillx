/**
 * Kit and revision endpoints: read the kit, list and read revisions, a
 * structural diff of two revisions, and `storeRevision`, the one write path
 * every new revision takes (manual, rebase candidate, conflict resolution,
 * reviewed proposal). A revision is immutable once stored; it starts as a
 * draft (or a proposal) and becomes effective only through activation.
 */
import { canonicalJson, revisionDigest, validateKitDocument } from "@skillx/contracts";
import type { PersonalKitDocument } from "@skillx/contracts";
import { releaseError } from "~/lib/releases/release-http";
import { conflict, handleOfKit, json } from "./kit-http";
import type { KitCaller } from "./kit-http";
import {
  commitKitMutation,
  findKit,
  getRevision,
  listRevisions,
  newId,
  ownedKit,
  ownedPublisher,
  requireActivePublisher,
  revisionByDigest,
  revisionByIdempotency,
  revisionView,
} from "./kit-store";
import type { GuardedStatement, KitRow, RevisionRow } from "./kit-store";
import { verifyDocument } from "./kit-verify";
import type { VerifiedDocument } from "./kit-verify";

export type RevisionOrigin = "manual" | "rebase" | "resolution" | "session-derived";

export interface StoreRequest {
  kitName: string;
  document: unknown;
  expectedGeneration: number;
  idempotencyKey: string;
  origin: RevisionOrigin;
  state?: "draft" | "proposed" | "quarantined";
  parentRevisionId?: string | null;
  /** Runs after verification and before the write; may refuse the document or decide its initial state. */
  check?: (doc: PersonalKitDocument, kit: KitRow | null, verified: VerifiedDocument) => Promise<{ state?: StoreRequest["state"] } | void>;
  /** Further guarded statements written atomically with the revision. */
  also?: (revisionId: string) => GuardedStatement[];
  /** Audit action; defaults to `revision.<origin>`. */
  action?: string;
}

export const generationConflict = () => conflict("kit.generation_conflict", "the kit changed; reload it and retry with its current generation");

export function kitView(kit: KitRow, effective: RevisionRow | null, openConflicts: number) {
  return {
    kit: kit.name,
    localId: kit.local_id,
    visibility: kit.visibility,
    generation: Number(kit.generation),
    latestRevisionNumber: Number(kit.latest_revision_number),
    effectiveRevision: effective === null ? null : { id: effective.id, number: Number(effective.revision_number), digest: effective.revision_digest },
    openConflicts,
  };
}

/** `GET /api/v1/kits/@h/n`, with a strong ETag of the generation. */
export async function readKit(caller: KitCaller, kitName: string): Promise<Response> {
  const kit = await ownedKit(caller.env.DB, kitName, caller.userId);
  const effective = kit.effective_revision_id === null ? null : await getRevision(caller.env.DB, kit.id, kit.effective_revision_id);
  const open = await caller.env.DB.prepare("SELECT count(*) AS n FROM personal_kit_conflicts WHERE kit_id = ? AND status = 'open'").bind(kit.id).first<{ n: number }>();
  return json(kitView(kit, effective, Number(open?.n ?? 0)), 200, { ETag: `"g${kit.generation}"` });
}

export async function readRevisions(caller: KitCaller, kitName: string): Promise<Response> {
  const kit = await ownedKit(caller.env.DB, kitName, caller.userId);
  return json({ kit: kit.name, revisions: (await listRevisions(caller.env.DB, kit.id)).map((r) => revisionView(r)) });
}

export async function readRevision(caller: KitCaller, kitName: string, id: string): Promise<Response> {
  const kit = await ownedKit(caller.env.DB, kitName, caller.userId);
  return json(revisionView(await getRevision(caller.env.DB, kit.id, id), true));
}

/**
 * Validates, verifies and stores one revision under the generation guard. A
 * new kit always starts private: only an activation sets its visibility, so
 * an API key never creates a public kit.
 */
export async function storeRevision(caller: KitCaller, req: StoreRequest): Promise<{ revision: RevisionRow; generation: number; warnings: string[]; replayed: boolean }> {
  const db = caller.env.DB;
  const existing = await findKit(db, req.kitName);
  if (existing !== null && existing.owner_user_id !== caller.userId) throw releaseError(404, "not_found", "Not found");
  const doc = validateKitDocument(req.document);
  const digest = await revisionDigest(doc);
  if (existing !== null) {
    const replay = await revisionByIdempotency(db, existing.id, req.idempotencyKey);
    if (replay !== null) {
      if (replay.revision_digest !== digest) throw conflict("kit.idempotency_conflict", "idempotencyKey was already used for a different document");
      return { revision: replay, generation: Number(existing.generation), warnings: [], replayed: true };
    }
  }
  if ((existing?.generation ?? 0) !== req.expectedGeneration) throw generationConflict();
  if (existing !== null) await requireActivePublisher(db, existing, caller.userId);
  const publisherId = existing?.publisher_id ?? (await ownedPublisher(db, handleOfKit(req.kitName), caller.userId));
  if (publisherId === null) throw releaseError(403, "kit.publisher_not_owned", `you do not own an active publisher @${handleOfKit(req.kitName)}`);
  const verified = await verifyDocument(caller, req.kitName, doc);
  const { warnings } = verified;
  if (existing !== null && (await revisionByDigest(db, existing.id, digest)) !== null) throw conflict("kit.revision_exists", "an identical revision already exists");
  const state = (await req.check?.(doc, existing, verified))?.state ?? req.state ?? "draft";

  const kitId = existing?.id ?? newId("pk");
  const id = newId("pkr");
  const number = Number(existing?.latest_revision_number ?? 0) + 1;
  const at = caller.now.getTime();
  const ok = await commitKitMutation(db, {
    kitId,
    generation: req.expectedGeneration,
    create: existing === null ? { name: req.kitName, publisherId, ownerUserId: caller.userId, localId: doc.localId ?? null, visibility: "private" } : undefined,
    statements: [
      {
        sql: `INSERT INTO personal_kit_revisions (id, kit_id, revision_number, parent_revision_id, revision_digest, document_json, state, origin,
                author_user_id, idempotency_key, created_at, quarantined_at)
              SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE {guard}`,
        binds: [
          id, kitId, number, req.parentRevisionId ?? existing?.effective_revision_id ?? null, digest, canonicalJson(doc), state, req.origin,
          caller.userId, req.idempotencyKey, at, state === "quarantined" ? at : null,
        ],
      },
      ...(req.also?.(id) ?? []),
    ],
    kitSet: ", latest_revision_number = ?",
    kitBinds: [number],
    audit: { actorKind: "user", actorId: caller.userId, action: req.action ?? `revision.${req.origin}`, revisionId: id, detail: state, at },
  });
  if (!ok) throw generationConflict();
  return { revision: await getRevision(db, kitId, id), generation: req.expectedGeneration + 1, warnings, replayed: false };
}

/** The response of a stored revision: 201 when created, 200 when an idempotent replay. */
export const storedResponse = (r: Awaited<ReturnType<typeof storeRevision>>) =>
  json({ revision: revisionView(r.revision), generation: r.generation, warnings: r.warnings, replayed: r.replayed }, r.replayed ? 200 : 201);

function entryChanges(a: PersonalKitDocument["skills"][number], b: PersonalKitDocument["skills"][number]) {
  const fields = (["mode", "alias", "exposure", "compositionDigest"] as const).filter((k) => a[k] !== b[k]);
  if (canonicalJson(a.base) !== canonicalJson(b.base)) fields.push("base" as never);
  const ops = (e: typeof a) => new Map(e.overlay.ops.map((o) => [o.path, canonicalJson(o)]));
  const [x, y] = [ops(a), ops(b)];
  const paths = [...new Set([...x.keys(), ...y.keys()])].filter((p) => x.get(p) !== y.get(p)).sort();
  return { identity: a.identity, fields, overlayPaths: paths };
}

/** `GET .../diff?from=<id>&to=<id>`: what changed between two revisions, by skill and field. */
export async function readDiff(caller: KitCaller, kitName: string, fromId: string, toId: string): Promise<Response> {
  const kit = await ownedKit(caller.env.DB, kitName, caller.userId);
  const [from, to] = await Promise.all([getRevision(caller.env.DB, kit.id, fromId), getRevision(caller.env.DB, kit.id, toId)]);
  const a = JSON.parse(from.document_json) as PersonalKitDocument;
  const b = JSON.parse(to.document_json) as PersonalKitDocument;
  const byId = (d: PersonalKitDocument) => new Map(d.skills.map((s) => [s.identity, s]));
  const [x, y] = [byId(a), byId(b)];
  const top = (["visibility", "parent", "exclude", "profile", "runtimes"] as const).filter((k) => canonicalJson(a[k] ?? null) !== canonicalJson(b[k] ?? null));
  return json({
    from: from.id,
    to: to.id,
    document: top,
    added: [...y.keys()].filter((k) => !x.has(k)),
    removed: [...x.keys()].filter((k) => !y.has(k)),
    changed: [...x.keys()].filter((k) => y.has(k)).map((k) => entryChanges(x.get(k)!, y.get(k)!)).filter((c) => c.fields.length > 0 || c.overlayPaths.length > 0),
  });
}
