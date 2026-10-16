/**
 * Optional `composition` of a revision document: the AgentKit manifest's
 * `extends` and `include` plus the user's resolution records (keep-old,
 * use-upstream, edit-overlay and fork decisions), so a kit synced from
 * SkillX can be rebased or edited from that copy. SkillX validates the shape
 * and stores it under the revision digest; it never resolves `extends` or
 * applies a record (the entries' pins and overlays stay the only truth).
 * Field names mirror AgentKit `agentkit.personal-kit/v1` and
 * `agentkit.skill-overlay-resolution/v1`. Nothing is normalized: lists are
 * refused, not reordered, so the client's digest and the server's agree.
 */
import { validateIdentity } from "@skillx/skill-tree/rules";
import { RELEASE_VERSION_PATTERN } from "../release-manifest";
import { KIT_CODES, kitError } from "./codes";
import { DIGEST_PATTERN } from "./overlay-envelope";

export type KitExtend = { kit: string; version: string } | { skillx: string; version: string; releaseDigest: string };

export const RESOLUTION_CHOICES = ["keep-old", "use-upstream", "edit-overlay", "fork"] as const;

export interface KitResolutionRecord {
  identity: string;
  path: string;
  category: string;
  baseFrom: string;
  baseTo: string;
  baseTreeFrom: string;
  baseTreeTo: string;
  choice: (typeof RESOLUTION_CHOICES)[number];
  fork?: { identity: string; alias: string };
  overlayDigestAfter: string;
  kit: string;
  fromVersion: string;
  toVersion: string;
  planToken: string;
  approvedBy: "user";
}

export interface KitComposition {
  extends: KitExtend[];
  include?: string[];
  resolutions?: KitResolutionRecord[];
}

export const KIT_COMPOSITION_LIMITS = { maxExtends: 16, maxInclude: 256, maxResolutions: 1000, maxText: 256, maxPath: 4096 } as const;

/** An AgentKit kit ID: lowercase [a-z0-9] words joined by single hyphens. */
const KIT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CATEGORY = /^conflict\.[a-z0-9_.-]{1,64}$/;
const TOKEN = /^[\x21-\x7e]{1,256}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const invalid = (path: string, detail: string) => kitError(KIT_CODES.documentInvalid, path, detail);

function only(raw: Record<string, unknown>, at: string, fields: string[]): void {
  for (const key of Object.keys(raw)) if (!fields.includes(key)) throw invalid(`${at}.${key}`, "is not a known field");
}

function identity(value: unknown, at: string): void {
  try {
    if (typeof value !== "string") throw new Error("not a string");
    validateIdentity(value);
  } catch (error) {
    throw invalid(at, `must be @publisher/name (${error instanceof Error ? error.message : String(error)})`);
  }
}

function text(value: unknown, at: string, pattern: RegExp, what: string): void {
  if (typeof value !== "string" || !pattern.test(value)) throw invalid(at, `must be ${what}`);
}

const digest = (value: unknown, at: string) => text(value, at, DIGEST_PATTERN, "sha256:<hex>");
const version = (value: unknown, at: string) => text(value, at, RELEASE_VERSION_PATTERN, "an exact release version");
const kitId = (value: unknown, at: string) => {
  text(value, at, KIT_ID, "a kit id (lowercase [a-z0-9] words joined by single hyphens)");
  if ((value as string).length > 64) throw invalid(at, "must be at most 64 bytes");
};

function list(raw: unknown, at: string, min: number, max: number): unknown[] {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) throw invalid(at, `must be an array of ${min} to ${max} entries`);
  return raw;
}

function unique(keys: string[], at: string): void {
  const seen = new Set<string>();
  keys.forEach((key, i) => {
    if (seen.has(key)) throw invalid(`${at}[${i}]`, "duplicates an earlier entry");
    seen.add(key);
  });
}

function checkExtend(raw: unknown, at: string): string {
  if (!isRecord(raw)) throw invalid(at, "must be an object");
  version(raw.version, `${at}.version`);
  if (raw.kit !== undefined && raw.skillx !== undefined) throw invalid(at, "names either kit or skillx, not both");
  if (raw.kit !== undefined) {
    only(raw, at, ["kit", "version"]);
    kitId(raw.kit, `${at}.kit`);
    return `kit:${raw.kit as string}`;
  }
  only(raw, at, ["skillx", "version", "releaseDigest"]);
  if (raw.skillx === undefined) throw invalid(at, "must name kit or skillx");
  identity(raw.skillx, `${at}.skillx`);
  digest(raw.releaseDigest, `${at}.releaseDigest`);
  return `skillx:${raw.skillx as string}`;
}

function checkRecord(raw: unknown, at: string): string {
  if (!isRecord(raw)) throw invalid(at, "must be an object");
  only(raw, at, ["identity", "path", "category", "baseFrom", "baseTo", "baseTreeFrom", "baseTreeTo", "choice", "fork", "overlayDigestAfter", "kit", "fromVersion", "toVersion", "planToken", "approvedBy"]);
  identity(raw.identity, `${at}.identity`);
  if (typeof raw.path !== "string" || raw.path === "" || raw.path.length > KIT_COMPOSITION_LIMITS.maxPath || /[\0-\x1f]/.test(raw.path)) {
    throw invalid(`${at}.path`, "must be a non-empty path without control characters");
  }
  text(raw.category, `${at}.category`, CATEGORY, "conflict.<category>");
  for (const key of ["baseFrom", "baseTo"]) if (raw[key] !== "absent") digest(raw[key], `${at}.${key}`);
  for (const key of ["baseTreeFrom", "baseTreeTo", "overlayDigestAfter"]) digest(raw[key], `${at}.${key}`);
  if (!(RESOLUTION_CHOICES as readonly unknown[]).includes(raw.choice)) throw invalid(`${at}.choice`, `must be one of: ${RESOLUTION_CHOICES.join(", ")}`);
  if (raw.choice === "fork") {
    if (!isRecord(raw.fork)) throw invalid(`${at}.fork`, "a fork record names the fork identity and alias");
    only(raw.fork, `${at}.fork`, ["identity", "alias"]);
    identity(raw.fork.identity, `${at}.fork.identity`);
    if (raw.fork.identity !== raw.identity) throw invalid(`${at}.fork.identity`, "must equal the record identity");
    text(raw.fork.alias, `${at}.fork.alias`, /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, "a directory alias");
  } else if (raw.fork !== undefined) throw invalid(`${at}.fork`, "is only allowed on a fork record");
  kitId(raw.kit, `${at}.kit`);
  version(raw.fromVersion, `${at}.fromVersion`);
  version(raw.toVersion, `${at}.toVersion`);
  text(raw.planToken, `${at}.planToken`, TOKEN, "1 to 256 printable ASCII characters");
  if (raw.approvedBy !== "user") throw invalid(`${at}.approvedBy`, "must be user");
  return `${raw.identity as string}\0${raw.path}\0${raw.category as string}`;
}

/** Validates `composition`; throws `PersonalKitError` (`kit.document_invalid`) at the offending path. */
export function validateComposition(raw: unknown): KitComposition {
  const at = "composition";
  if (!isRecord(raw)) throw invalid(at, "must be an object");
  only(raw, at, ["extends", "include", "resolutions"]);
  const ext = list(raw.extends, `${at}.extends`, 1, KIT_COMPOSITION_LIMITS.maxExtends);
  unique(ext.map((e, i) => checkExtend(e, `${at}.extends[${i}]`)), `${at}.extends`);
  if (raw.include !== undefined) {
    const include = list(raw.include, `${at}.include`, 0, KIT_COMPOSITION_LIMITS.maxInclude);
    include.forEach((id, i) => identity(id, `${at}.include[${i}]`));
    unique(include as string[], `${at}.include`);
  }
  if (raw.resolutions !== undefined) {
    const records = list(raw.resolutions, `${at}.resolutions`, 0, KIT_COMPOSITION_LIMITS.maxResolutions);
    unique(records.map((r, i) => checkRecord(r, `${at}.resolutions[${i}]`)), `${at}.resolutions`);
  }
  return raw as unknown as KitComposition;
}
