/**
 * `skillx.personal-kit/v1`: one immutable revision of a personal kit. Each
 * skill entry pins a base release and carries the user's overlay plus the
 * expected `compositionDigest`. Validation is structural and offline; the
 * server re-derives every `compositionDigest` from the pinned base bytes.
 *
 * Mode rules: `extend` adds files only and keeps the base identity;
 * `override` may change anything but keeps the base identity; `fork` takes
 * a new identity under the kit handle with its own directory alias. A
 * shared skill (owned by AgentKit `kits/core` or shipped by more than one
 * official kit) may only be forked, never overlaid in place; the server
 * supplies that set to `sharedAliasViolation` (AgentKit `overlay.shared_alias`).
 */
import { ERROR_CODES, checkDirectoryAlias, compareUtf8, directoryAliasKey, isSkillTreeError, validateIdentity } from "@skillx/skill-tree/rules";
import type { Exposure } from "@skillx/skill-tree/rules";
import { canonicalJsonBytes } from "../canonical-json";
import { RELEASE_VERSION_PATTERN } from "../release-manifest";
import { satisfiesRange } from "../semver-range";
import { KIT_CODES, PERSONAL_KIT_SCHEMA, PersonalKitError, kitError } from "./codes";
import { sha256Hex } from "./bytes";
import { DIGEST_PATTERN, validateOverlay } from "./overlay-envelope";
import type { SkillOverlay } from "./overlay-envelope";

export const KIT_MODES = ["extend", "override", "fork"] as const;
export type KitMode = (typeof KIT_MODES)[number];
export type KitVisibility = "private" | "public";

export interface KitSkillEntry {
  identity: string;
  mode: KitMode;
  base: { package: string; version: string; releaseDigest: string };
  alias?: string;
  overlay: SkillOverlay;
  compositionDigest: string;
  exposure?: Exposure;
}

export interface PersonalKitDocument {
  schema: typeof PERSONAL_KIT_SCHEMA;
  kit: string;
  localId?: string;
  visibility: KitVisibility;
  parent?: { kit: string; revisionDigest: string };
  skills: KitSkillEntry[];
  exclude: string[];
  profile?: string;
  runtimes: Record<string, string>;
}

export const KIT_DOCUMENT_LIMITS = { maxBytes: 1024 * 1024, maxSkills: 128, maxExclude: 256, maxRuntimes: 16 } as const;

const PROFILE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RUNTIME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const EXPOSURES = ["INTERNAL", "EXPLICIT", "AUTO"];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const invalid = (path: string, detail: string) => kitError(KIT_CODES.documentInvalid, path, detail);

function only(raw: Record<string, unknown>, at: string, fields: string[]): void {
  for (const key of Object.keys(raw)) if (!fields.includes(key)) throw invalid(at === "" ? key : `${at}.${key}`, "is not a known field");
}

function identity(value: unknown, at: string): string {
  if (typeof value !== "string") throw invalid(at, "must be @publisher/name");
  try {
    validateIdentity(value);
  } catch (error) {
    throw invalid(at, `must be @publisher/name (${error instanceof Error ? error.message : String(error)})`);
  }
  return value;
}

const handleOf = (id: string) => id.slice(1, id.indexOf("/"));
const nameOf = (id: string) => id.slice(id.indexOf("/") + 1);

function checkEntry(raw: unknown, at: string, kitHandle: string): KitSkillEntry {
  if (!isRecord(raw)) throw invalid(at, "must be an object");
  only(raw, at, ["identity", "mode", "base", "alias", "overlay", "compositionDigest", "exposure"]);
  const id = identity(raw.identity, `${at}.identity`);
  if (typeof raw.mode !== "string" || !(KIT_MODES as readonly string[]).includes(raw.mode)) throw invalid(`${at}.mode`, `must be one of: ${KIT_MODES.join(", ")}`);
  const mode = raw.mode as KitMode;
  if (!isRecord(raw.base)) throw invalid(`${at}.base`, "must be an object");
  only(raw.base, `${at}.base`, ["package", "version", "releaseDigest"]);
  const pkg = identity(raw.base.package, `${at}.base.package`);
  if (typeof raw.base.version !== "string" || !RELEASE_VERSION_PATTERN.test(raw.base.version)) throw invalid(`${at}.base.version`, "must be a release version");
  if (typeof raw.base.releaseDigest !== "string" || !DIGEST_PATTERN.test(raw.base.releaseDigest)) throw invalid(`${at}.base.releaseDigest`, "must be sha256:<hex>");
  if (typeof raw.compositionDigest !== "string" || !DIGEST_PATTERN.test(raw.compositionDigest)) throw invalid(`${at}.compositionDigest`, "must be sha256:<hex>");
  if (raw.exposure !== undefined && !EXPOSURES.includes(raw.exposure as string)) throw invalid(`${at}.exposure`, `must be one of: ${EXPOSURES.join(", ")}`);
  const overlay = validateOverlay(raw.overlay, `${at}.overlay`);
  if (overlay.baseTreeDigest !== raw.base.releaseDigest) throw invalid(`${at}.overlay.baseTreeDigest`, "must equal base.releaseDigest (the base tree digest)");
  const entry: KitSkillEntry = { ...(raw as unknown as KitSkillEntry), overlay };
  const mv = (detail: string) => kitError(KIT_CODES.modeViolation, at, detail);
  if (mode === "fork") {
    if (id === pkg) throw mv("a fork needs a new identity");
    if (handleOf(id) !== kitHandle) throw mv(`a fork identity must be published under @${kitHandle}`);
    if (typeof raw.alias !== "string") throw mv("a fork needs a directory alias");
  } else {
    if (id !== pkg) throw mv(`${mode} keeps the base identity`);
    if (mode === "extend" && overlay.ops.some((op) => op.op !== "add")) throw mv("extend may only add files");
  }
  if (raw.alias !== undefined) {
    if (typeof raw.alias !== "string") throw invalid(`${at}.alias`, "must be a string");
    try {
      checkDirectoryAlias(id, raw.alias);
    } catch (error) {
      const reserved = isSkillTreeError(error) && error.code === ERROR_CODES.identityReservedAlias;
      throw kitError(reserved ? KIT_CODES.reservedAlias : KIT_CODES.aliasCollision, `${at}.alias`, error instanceof Error ? error.message : String(error));
    }
  }
  return entry;
}

/** The directory alias an entry projects to. */
export const entryAlias = (e: KitSkillEntry) => e.alias ?? nameOf(e.identity);

function checkSkills(raw: unknown, kitHandle: string): KitSkillEntry[] {
  if (!Array.isArray(raw) || raw.length > KIT_DOCUMENT_LIMITS.maxSkills) throw invalid("skills", `must be an array of at most ${KIT_DOCUMENT_LIMITS.maxSkills} entries`);
  const skills = raw.map((s, i) => checkEntry(s, `skills[${i}]`, kitHandle));
  const aliases = new Map<string, KitSkillEntry>();
  skills.forEach((s, i) => {
    if (i > 0) {
      const order = compareUtf8(skills[i - 1]!.identity, s.identity);
      if (order === 0) throw kitError(KIT_CODES.duplicateIdentity, `skills[${i}].identity`, `${s.identity} appears twice`);
      if (order > 0) throw invalid(`skills[${i}].identity`, "skills must be sorted by identity");
    }
    const key = directoryAliasKey(entryAlias(s));
    const other = aliases.get(key);
    if (other !== undefined) throw kitError(KIT_CODES.aliasCollision, `skills[${i}].alias`, `alias ${entryAlias(s)} is also used by ${other.identity}`);
    aliases.set(key, s);
  });
  return skills;
}

function checkRuntimes(raw: unknown): Record<string, string> {
  if (raw === undefined) return {};
  if (!isRecord(raw) || Object.keys(raw).length > KIT_DOCUMENT_LIMITS.maxRuntimes) throw invalid("runtimes", "must be an object of runtime ranges");
  for (const [name, range] of Object.entries(raw)) {
    if (!RUNTIME.test(name)) throw invalid(`runtimes.${name}`, "runtime names are lowercase [a-z0-9-]");
    if (typeof range !== "string" || satisfiesRange("0.0.0", range) === null) throw invalid(`runtimes.${name}`, "must be a supported semver range");
  }
  return raw as Record<string, string>;
}

/** Validates a revision document. Throws `PersonalKitError`. */
export function validateKitDocument(input: unknown): PersonalKitDocument {
  if (!isRecord(input)) throw invalid("", "document must be an object");
  if (typeof input.schema === "string" && input.schema.startsWith("skillx.personal-kit/") && input.schema !== PERSONAL_KIT_SCHEMA) {
    throw kitError(KIT_CODES.unsupportedVersion, "schema", `unsupported document schema ${input.schema}`);
  }
  if (input.schema !== PERSONAL_KIT_SCHEMA) throw invalid("schema", `must be ${PERSONAL_KIT_SCHEMA}`);
  only(input, "", ["schema", "kit", "localId", "visibility", "parent", "skills", "exclude", "profile", "runtimes"]);
  const kit = identity(input.kit, "kit");
  if (input.localId !== undefined && input.localId !== `local/${nameOf(kit)}`) throw invalid("localId", `must be local/${nameOf(kit)}`);
  if (input.visibility !== "private" && input.visibility !== "public") throw invalid("visibility", "must be private or public");
  if (Array.isArray(input.parent)) throw kitError(KIT_CODES.multiParent, "parent", "a personal kit has at most one parent");
  if (input.parent !== undefined) {
    if (!isRecord(input.parent)) throw invalid("parent", "must be an object");
    only(input.parent, "parent", ["kit", "revisionDigest"]);
    identity(input.parent.kit, "parent.kit");
    if (input.parent.kit === kit) throw kitError(KIT_CODES.cycle, "parent.kit", "a kit cannot be its own parent");
    if (typeof input.parent.revisionDigest !== "string" || !DIGEST_PATTERN.test(input.parent.revisionDigest)) throw invalid("parent.revisionDigest", "must be sha256:<hex>");
  }
  const skills = checkSkills(input.skills, handleOf(kit));
  const exclude = input.exclude ?? [];
  if (!Array.isArray(exclude) || exclude.length > KIT_DOCUMENT_LIMITS.maxExclude) throw invalid("exclude", "must be an array of identities");
  exclude.forEach((e, i) => identity(e, `exclude[${i}]`));
  if (input.profile !== undefined && (typeof input.profile !== "string" || !PROFILE.test(input.profile))) throw invalid("profile", "must be lowercase [a-z0-9-], at most 64 characters");
  const doc = { ...(input as unknown as PersonalKitDocument), skills, exclude: exclude as string[], runtimes: checkRuntimes(input.runtimes) };
  if (canonicalJsonBytes(doc).length > KIT_DOCUMENT_LIMITS.maxBytes) throw invalid("", "document exceeds 1 MiB");
  return doc;
}

/** `sha256:<hex>` of the canonical JSON of a validated document. */
export async function revisionDigest(doc: PersonalKitDocument): Promise<string> {
  return `sha256:${await sha256Hex(canonicalJsonBytes(doc))}`;
}

/**
 * The first in-place overlay (non-fork entry with ops) of a shared skill, as
 * `overlay.shared_alias`; null when there is none. `isShared` names the
 * shared identities (AgentKit `kits/core` or more than one official kit).
 */
export function sharedAliasViolation(doc: PersonalKitDocument, isShared: (identity: string) => boolean): PersonalKitError | null {
  const i = doc.skills.findIndex((s) => s.mode !== "fork" && s.overlay.ops.length > 0 && isShared(s.identity));
  if (i < 0) return null;
  return kitError(KIT_CODES.sharedAlias, `skills[${i}]`, "the overlaid alias has more than one foundation owner; fork it under a new alias");
}

/** Parses a document and returns a classified error instead of throwing. */
export function tryValidateKitDocument(input: unknown): { ok: true; doc: PersonalKitDocument } | { ok: false; error: PersonalKitError } {
  try {
    return { ok: true, doc: validateKitDocument(input) };
  } catch (error) {
    if (error instanceof PersonalKitError) return { ok: false, error };
    throw error;
  }
}
