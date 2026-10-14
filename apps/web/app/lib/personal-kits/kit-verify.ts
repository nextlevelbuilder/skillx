/**
 * Server-side verification of a revision document before it is stored:
 * the document names the route kit, every base is loadable by the owner,
 * every `compositionDigest` is re-derived from the pinned base bytes plus
 * the overlay, the parent chain resolves (single parent, no cycle, at most
 * four kits) and a public kit derives only from public bases and a public
 * parent. A parent kit of another owner is usable only through a revision
 * that was authored public and activated by its owner (never a draft,
 * proposal, rejected or quarantined revision). A shared skill (see
 * `sharedSkills`) may be forked but never overlaid in place. Nothing here
 * trusts a digest the client computed.
 */
import {
  KIT_CODES,
  MAX_LINEAGE_DEPTH,
  PersonalKitError,
  applyOverlay,
  kitError,
  publicDerivativeViolation,
  resolveLineage,
  sharedAliasViolation,
} from "@skillx/contracts";
import type { PersonalKitDocument } from "@skillx/contracts";
import { baseFailure, loadPinnedBase } from "./base-loader";
import type { LoadedBase } from "./base-loader";
import type { KitCaller } from "./kit-http";
import { documentOf, findKit, revisionByDigest } from "./kit-store";
import type { RevisionRow } from "./kit-store";

export interface VerifiedDocument {
  chain: PersonalKitDocument[];
  bases: Map<string, LoadedBase>;
  warnings: string[];
}

const UNUSABLE_PARENT_STATES = new Set(["proposed", "rejected", "quarantined"]);

/**
 * Skill identities that may not be overlaid in place: those owned by AgentKit
 * `kits/core` or shipped by more than one official kit. The deployment sets
 * them in `SKILLX_SHARED_SKILL_ALIASES` (comma or whitespace separated).
 */
export function sharedSkills(env: { SKILLX_SHARED_SKILL_ALIASES?: string }): Set<string> {
  return new Set((env.SKILLX_SHARED_SKILL_ALIASES ?? "").split(/[\s,]+/).filter((s) => s !== ""));
}

/** A foreign parent must be a public, activated, reviewed revision that was authored public. */
const usableForeignParent = (row: RevisionRow) =>
  row.state === "reviewed" && row.activated_at !== null && documentOf(row).visibility === "public";

export interface LoadedChain {
  chain: PersonalKitDocument[];
  parentPublic: boolean;
  /** Indexes into `chain` of documents the caller does not own. */
  foreign: Set<number>;
}

/**
 * Child-first lineage of `doc`: parents are found by kit name and revision
 * digest. An unreviewed proposal is never a parent. With `quarantined`, a
 * parent quarantined after it was used is kept and reported there (the lock
 * fails with `kit.locked_incompatible`); without it, it is unavailable.
 */
export async function loadChain(caller: KitCaller, doc: PersonalKitDocument, quarantined?: string[]): Promise<LoadedChain> {
  const { env, userId } = caller;
  const chain = [doc];
  const foreign = new Set<number>();
  let parentPublic = true;
  for (let cur = doc; cur.parent !== undefined; cur = chain[chain.length - 1]!) {
    if (chain.length >= MAX_LINEAGE_DEPTH || chain.some((d, i) => i > 0 && d.kit === cur.parent!.kit) || cur.parent.kit === doc.kit) {
      throw kitError(KIT_CODES.cycle, "parent", "the parent chain repeats a kit or exceeds four kits");
    }
    const kit = await findKit(env.DB, cur.parent.kit);
    const owned = kit !== null && kit.owner_user_id === userId;
    const readable = owned || (kit !== null && kit.visibility === "public");
    const row = readable ? await revisionByDigest(env.DB, kit!.id, cur.parent.revisionDigest) : null;
    const held = row !== null && row.state === "quarantined" && quarantined !== undefined && (owned || (row.activated_at !== null && documentOf(row).visibility === "public"));
    const usable = row !== null && !UNUSABLE_PARENT_STATES.has(row.state) && (owned || usableForeignParent(row));
    if (held) quarantined.push(`parent ${cur.parent.kit} revision ${cur.parent.revisionDigest} is quarantined`);
    else if (!usable) {
      throw kitError(KIT_CODES.baseUnavailable, "parent", `parent revision ${cur.parent.revisionDigest} of ${cur.parent.kit} is not available`);
    }
    if (kit!.visibility !== "public") parentPublic = false;
    if (!owned) foreign.add(chain.length);
    chain.push(documentOf(row!));
  }
  resolveLineage(chain);
  return { chain, parentPublic, foreign };
}

/** The chain as returned to the caller: own documents in full, foreign ancestors as digest references only. */
export const chainView = ({ chain, foreign }: LoadedChain) =>
  chain.map((d, i) => (foreign.has(i) ? { kit: d.kit, revisionDigest: chain[i - 1]!.parent!.revisionDigest, foreign: true } : d));

/** Loads and checks every base of `doc`. */
export async function verifyDocument(caller: KitCaller, kitName: string, doc: PersonalKitDocument): Promise<VerifiedDocument> {
  const { env, userId } = caller;
  if (doc.kit !== kitName) throw kitError(KIT_CODES.documentInvalid, "kit", `document names ${doc.kit}, not ${kitName}`);
  const shared = sharedSkills(env);
  const sharedViolation = sharedAliasViolation(doc, (id) => shared.has(id));
  if (sharedViolation !== null) throw sharedViolation;
  const bases = new Map<string, LoadedBase>();
  const warnings: string[] = [];
  for (const [i, entry] of doc.skills.entries()) {
    const at = `skills[${i}]`;
    let base: LoadedBase;
    try {
      base = await loadPinnedBase(env, userId, entry.base, caller.bases);
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
  const { chain, parentPublic } = await loadChain(caller, doc);
  const violation = publicDerivativeViolation(doc, (pkg) => [...bases.values()].some((b) => b.release.identity === pkg && b.release.visibility === "public"), parentPublic);
  if (violation !== null) throw kitError(KIT_CODES.publicDerivative, "visibility", violation);
  return { chain, bases, warnings };
}
