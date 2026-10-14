/**
 * Lineage resolution and the `skillx.personal-kit-lock/v1` document.
 *
 * A kit has at most one parent; the chain is walked child first, at most
 * `MAX_LINEAGE_DEPTH` kits deep, and a repeated kit is a cycle. The effective
 * skill set starts from the root ancestor; each descendant removes its
 * `exclude` identities and replaces entries of the same identity. Every
 * effective entry records the kit that owns it. The lock is canonical JSON
 * with no clock or generation, so equal inputs give equal bytes.
 */
import { compareUtf8, directoryAliasKey } from "@skillx/skill-tree/rules";
import { canonicalJsonBytes } from "../canonical-json";
import { KIT_CODES, KIT_RESOLVER_VERSION, PERSONAL_KIT_LOCK_SCHEMA, kitError } from "./codes";
import { sha256Hex } from "./bytes";
import { entryAlias } from "./kit-document";
import type { KitSkillEntry, PersonalKitDocument } from "./kit-document";

export const MAX_LINEAGE_DEPTH = 4;

export interface EffectiveEntry {
  entry: KitSkillEntry;
  /** Kit identity that owns this entry. */
  owner: string;
}

/** Effective entries of a child-first chain (`chain[0]` is the kit, `chain[i+1]` the parent of `chain[i]`). */
export function resolveLineage(chain: readonly PersonalKitDocument[]): EffectiveEntry[] {
  if (chain.length === 0) throw kitError(KIT_CODES.documentInvalid, "", "empty lineage");
  if (chain.length > MAX_LINEAGE_DEPTH) throw kitError(KIT_CODES.cycle, "parent", `lineage deeper than ${MAX_LINEAGE_DEPTH} kits`);
  const seen = new Set<string>();
  chain.forEach((doc, i) => {
    if (seen.has(doc.kit)) throw kitError(KIT_CODES.cycle, "parent", `${doc.kit} appears twice in its own lineage`);
    seen.add(doc.kit);
    const next = chain[i + 1];
    if (next !== undefined && doc.parent?.kit !== next.kit) throw kitError(KIT_CODES.documentInvalid, "parent", `${doc.kit} does not name ${next.kit} as parent`);
    if (next === undefined && doc.parent !== undefined) throw kitError(KIT_CODES.documentInvalid, "parent", `the parent ${doc.parent.kit} of ${doc.kit} is missing from the chain`);
  });
  const effective = new Map<string, EffectiveEntry>();
  for (const doc of [...chain].reverse()) {
    for (const id of doc.exclude) effective.delete(id);
    for (const entry of doc.skills) effective.set(entry.identity, { entry, owner: doc.kit });
  }
  const out = [...effective.values()].sort((a, b) => compareUtf8(a.entry.identity, b.entry.identity));
  const aliases = new Map<string, string>();
  for (const { entry } of out) {
    const key = directoryAliasKey(entryAlias(entry));
    const other = aliases.get(key);
    if (other !== undefined) throw kitError(KIT_CODES.aliasCollision, entry.identity, `alias ${entryAlias(entry)} is also used by ${other}`);
    aliases.set(key, entry.identity);
  }
  return out;
}

export interface KitLockEntry {
  identity: string;
  alias: string;
  mode: KitSkillEntry["mode"];
  exposure: string | null;
  package: string;
  version: string;
  releaseDigest: string;
  overlayDigests: string[];
  compositionDigest: string;
  owner: string;
}

export interface PersonalKitLock {
  schema: typeof PERSONAL_KIT_LOCK_SCHEMA;
  resolver: typeof KIT_RESOLVER_VERSION;
  kit: string;
  localId: string | null;
  revisionId: string;
  revisionNumber: number;
  revisionDigest: string;
  profile: string | null;
  runtimes: Record<string, string>;
  entries: KitLockEntry[];
}

/** `sha256:<hex>` of the canonical JSON of one overlay envelope. */
export async function overlayDigest(entry: KitSkillEntry): Promise<string> {
  return `sha256:${await sha256Hex(canonicalJsonBytes(entry.overlay))}`;
}

export interface LockRevision {
  id: string;
  number: number;
  digest: string;
}

/** Builds the lock of a kit revision from its child-first lineage. */
export async function buildKitLock(chain: readonly PersonalKitDocument[], revision: LockRevision): Promise<PersonalKitLock> {
  const doc = chain[0]!;
  const entries: KitLockEntry[] = [];
  for (const { entry, owner } of resolveLineage(chain)) {
    entries.push({
      identity: entry.identity,
      alias: entryAlias(entry),
      mode: entry.mode,
      exposure: entry.exposure ?? null,
      package: entry.base.package,
      version: entry.base.version,
      releaseDigest: entry.base.releaseDigest,
      overlayDigests: entry.overlay.ops.length === 0 ? [] : [await overlayDigest(entry)],
      compositionDigest: entry.compositionDigest,
      owner: `personal:${owner}`,
    });
  }
  return {
    schema: PERSONAL_KIT_LOCK_SCHEMA,
    resolver: KIT_RESOLVER_VERSION,
    kit: doc.kit,
    localId: doc.localId ?? null,
    revisionId: revision.id,
    revisionNumber: revision.number,
    revisionDigest: revision.digest,
    profile: doc.profile ?? null,
    runtimes: doc.runtimes,
    entries,
  };
}

/** A public kit may only derive from public bases and a public parent. */
export function publicDerivativeViolation(doc: PersonalKitDocument, isPublicBase: (pkg: string) => boolean, parentPublic: boolean): string | null {
  if (doc.visibility !== "public") return null;
  if (doc.parent !== undefined && !parentPublic) return `parent ${doc.parent.kit} is private`;
  const hidden = doc.skills.find((s) => !isPublicBase(s.base.package));
  return hidden === undefined ? null : `base ${hidden.base.package} is private or paid`;
}
