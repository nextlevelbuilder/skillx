/**
 * Server-side verification of a revision document before it is stored:
 * the document names the route kit, every base is loadable by the owner,
 * every `compositionDigest` is re-derived from the pinned base bytes plus
 * the overlay, the parent chain resolves (single parent, no cycle, at most
 * four kits) and a public kit derives only from public bases and a public
 * parent. Nothing here trusts a digest the client computed.
 */
import {
  KIT_CODES,
  MAX_LINEAGE_DEPTH,
  PersonalKitError,
  applyOverlay,
  kitError,
  publicDerivativeViolation,
  resolveLineage,
} from "@skillx/contracts";
import type { PersonalKitDocument } from "@skillx/contracts";
import { baseFailure, loadPinnedBase } from "./base-loader";
import type { LoadedBase } from "./base-loader";
import { documentOf, findKit, revisionByDigest } from "./kit-store";

export interface VerifiedDocument {
  chain: PersonalKitDocument[];
  bases: Map<string, LoadedBase>;
  warnings: string[];
}

const UNUSABLE_PARENT_STATES = new Set(["rejected", "quarantined"]);

/** Child-first lineage of `doc`: parents are found by kit name and revision digest. */
export async function loadChain(env: Env, userId: string, doc: PersonalKitDocument): Promise<{ chain: PersonalKitDocument[]; parentPublic: boolean }> {
  const chain = [doc];
  let parentPublic = true;
  for (let cur = doc; cur.parent !== undefined; cur = chain[chain.length - 1]!) {
    if (chain.length >= MAX_LINEAGE_DEPTH || chain.some((d, i) => i > 0 && d.kit === cur.parent!.kit) || cur.parent.kit === doc.kit) {
      throw kitError(KIT_CODES.cycle, "parent", "the parent chain repeats a kit or exceeds four kits");
    }
    const kit = await findKit(env.DB, cur.parent.kit);
    const readable = kit !== null && (kit.owner_user_id === userId || kit.visibility === "public");
    const row = readable ? await revisionByDigest(env.DB, kit!.id, cur.parent.revisionDigest) : null;
    if (row === null || UNUSABLE_PARENT_STATES.has(row.state)) {
      throw kitError(KIT_CODES.baseUnavailable, "parent", `parent revision ${cur.parent.revisionDigest} of ${cur.parent.kit} is not available`);
    }
    if (kit!.visibility !== "public") parentPublic = false;
    chain.push(documentOf(row));
  }
  resolveLineage(chain);
  return { chain, parentPublic };
}

/** Loads and checks every base of `doc`. */
export async function verifyDocument(env: Env, userId: string, kitName: string, doc: PersonalKitDocument): Promise<VerifiedDocument> {
  if (doc.kit !== kitName) throw kitError(KIT_CODES.documentInvalid, "kit", `document names ${doc.kit}, not ${kitName}`);
  const bases = new Map<string, LoadedBase>();
  const warnings: string[] = [];
  for (const [i, entry] of doc.skills.entries()) {
    const at = `skills[${i}]`;
    let base: LoadedBase;
    try {
      base = await loadPinnedBase(env, userId, entry.base);
    } catch (error) {
      const failure = baseFailure(error);
      if (failure === null) throw error;
      throw kitError(KIT_CODES.baseUnavailable, `${at}.base`, `${entry.base.package}@${entry.base.version} is not available (${failure})`);
    }
    if (base.release.state === "yanked") warnings.push(`${entry.base.package}@${entry.base.version} is yanked; the pin still resolves`);
    let digest: string;
    try {
      digest = (await applyOverlay(base.tree, entry.overlay)).digest;
    } catch (error) {
      if (error instanceof PersonalKitError) throw kitError(error.code, `${at}.overlay${error.path === "" ? "" : `:${error.path}`}`, error.detail);
      throw error;
    }
    if (digest !== entry.compositionDigest) {
      throw kitError(KIT_CODES.compositionMismatch, `${at}.compositionDigest`, `the overlay on the pinned base gives ${digest}`);
    }
    bases.set(entry.identity, base);
  }
  const { chain, parentPublic } = await loadChain(env, userId, doc);
  const violation = publicDerivativeViolation(doc, (pkg) => [...bases.values()].some((b) => b.release.identity === pkg && b.release.visibility === "public"), parentPublic);
  if (violation !== null) throw kitError(KIT_CODES.publicDerivative, "visibility", violation);
  return { chain, bases, warnings };
}
