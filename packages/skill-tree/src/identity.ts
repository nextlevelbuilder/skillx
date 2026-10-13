/**
 * Package identity, provenance trust and alias rules (AgentKit skill
 * lifecycle contract section 2). Every check throws a `SkillTreeError` with
 * a contract code; nothing here folds case beyond ASCII.
 */
import { ERROR_CODES, treeError } from "./errors";
import { asciiLower, asciiUpper, segmentViolation } from "./path-rules";

/** The SkillX package name pattern; identities compare byte-for-byte after validation. */
export const IDENTITY_PATTERN = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
export const MAX_IDENTITY_SEGMENT_BYTES = 64;
export const MAX_ALIAS_BYTES = 128;

/** Publisher reserved for content composed from an AgentKit kit. */
export const RESERVED_PUBLISHER = "agentkit";

export const PROVIDERS = ["kit", "local", "git", "skillx"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const KIT_ORIGINS = ["remote-signed", "local-dev"] as const;
export type KitOrigin = (typeof KIT_ORIGINS)[number];
export type Trust = "signed-kit" | "publisher-signed" | "local-unverified";

const KIT_DIR_PREFIX = "ak-";

const invalid = (detail: string) => treeError(ERROR_CODES.identityInvalid, "", detail);

function splitIdentity(id: string): [publisher: string, slug: string] {
  const slash = id.indexOf("/");
  return [id.slice(1, slash), id.slice(slash + 1)];
}

/** `@<publisher>/<slug>` whose publisher and slug each pass the tree segment rules and are at most 64 bytes. */
export function validateIdentity(id: string): void {
  if (!IDENTITY_PATTERN.test(id)) throw invalid(`identity ${JSON.stringify(id)} does not match ${IDENTITY_PATTERN.source}`);
  for (const segment of splitIdentity(id)) {
    // The pattern admits ASCII only, so the length in bytes is the string length.
    if (segment.length > MAX_IDENTITY_SEGMENT_BYTES) {
      throw invalid(`identity ${JSON.stringify(id)} segment exceeds ${MAX_IDENTITY_SEGMENT_BYTES} bytes`);
    }
    const reason = segmentViolation(segment);
    if (reason !== "") throw invalid(`identity ${JSON.stringify(id)} segment ${JSON.stringify(segment)} ${reason}`);
  }
}

/** Maps a kit skill directory (`ak-plan`) to its identity (`@agentkit/plan`) and portable alias. */
export function kitIdentity(dirName: string): { identity: string; alias: string } {
  if (!dirName.startsWith(KIT_DIR_PREFIX)) throw invalid(`kit skill directory ${JSON.stringify(dirName)} does not start with "ak-"`);
  const identity = `@${RESERVED_PUBLISHER}/${dirName.slice(KIT_DIR_PREFIX.length)}`;
  validateIdentity(identity);
  return { identity, alias: dirName };
}

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

function checkPublisherFor(identity: string, provider: Provider): void {
  validateIdentity(identity);
  const [publisher] = splitIdentity(identity);
  if (publisher === RESERVED_PUBLISHER && provider !== "kit") {
    throw treeError(ERROR_CODES.identityReservedPublisher, "", `provider ${provider} cannot use the reserved publisher of ${identity}`);
  }
  if (publisher !== RESERVED_PUBLISHER && provider === "kit") {
    throw invalid(`kit content must use the "${RESERVED_PUBLISHER}" publisher, not ${identity}`);
  }
}

/** Provider, then identity, then the reserved-publisher pairing, in contract order. */
export function checkPublisher(identity: string, provider: string): void {
  if (!isProvider(provider)) throw invalid(`unknown source provider ${JSON.stringify(provider)} for ${identity}`);
  checkPublisherFor(identity, provider);
}

export interface Provenance {
  provider: string;
  /** Kit sources only. */
  origin?: string;
  /** SkillX releases only: whether publisher provenance verified. */
  verified?: boolean;
  /** Whether the composition has a non-empty overlay. */
  overlay?: boolean;
}

/** Trust of an accepted package; trust follows origin, not identity. */
export function trustOf(identity: string, p: Provenance): Trust {
  if (!isProvider(p.provider)) throw invalid(`unknown source provider ${JSON.stringify(p.provider)} for ${identity}`);
  if (p.provider === "kit" && !(KIT_ORIGINS as readonly string[]).includes(p.origin ?? "")) {
    throw invalid(`unknown kit origin ${JSON.stringify(p.origin ?? "")} for ${identity}`);
  }
  checkPublisherFor(identity, p.provider);
  if (p.overlay === true) return "local-unverified";
  if (p.provider === "kit" && p.origin === "remote-signed") return "signed-kit";
  if (p.provider === "skillx" && p.verified === true) return "publisher-signed";
  return "local-unverified";
}

const hasAlphanumeric = (s: string) => /[A-Za-z0-9]/.test(s);

function checkAliasShape(alias: string): void {
  if (alias === "" || alias.length > MAX_ALIAS_BYTES) throw invalid(`alias ${JSON.stringify(alias)} is not 1 to ${MAX_ALIAS_BYTES} characters`);
  if (!/^[A-Za-z0-9._:/$-]+$/.test(alias)) throw invalid(`alias ${JSON.stringify(alias)} contains a character outside [A-Za-z0-9._:/$-]`);
  let rest = alias;
  if (alias.startsWith("/")) {
    rest = alias.slice(1);
    if (rest.includes("/") || !rest.includes(":")) {
      throw invalid(`alias ${JSON.stringify(alias)} starts with "/" but is not a native namespace:command form`);
    }
  }
  for (const segment of rest.split("/")) {
    if (segment === "" || segment === "." || segment === "..") throw invalid(`alias ${JSON.stringify(alias)} has an empty, "." or ".." segment`);
    const parts = segment.split(":");
    if (parts.every(hasAlphanumeric)) continue;
    if (parts.includes("")) throw invalid(`alias ${JSON.stringify(alias)} has a ":" without text on both sides`);
    throw invalid(`alias ${JSON.stringify(alias)} has a segment or ":"-separated part without an ASCII letter or digit`);
  }
}

function checkAliasInput(identity: string, alias: string): void {
  validateIdentity(identity);
  if (/[^\x00-\x7f]/.test(alias)) throw invalid(`alias ${JSON.stringify(alias)} contains a non-ASCII character`);
  checkAliasShape(alias);
}

function checkReservedAlias(identity: string, alias: string): void {
  if (splitIdentity(identity)[0] === RESERVED_PUBLISHER) return;
  const segments = asciiUpper(alias.replace(/^\/+/, "")).split("/");
  for (const raw of segments) {
    const segment = raw.replace(/^\$+/, "");
    if (segment.startsWith("AK-") || segment.startsWith("AK:")) {
      throw treeError(ERROR_CODES.identityReservedAlias, "", `alias ${JSON.stringify(alias)} is reserved for @${RESERVED_PUBLISHER} identities, not ${identity}`);
    }
  }
}

/** Validates an invocation alias for an identity: shape first, then the reserved `ak-`/`ak:` prefixes. */
export function checkAlias(identity: string, alias: string): void {
  checkAliasInput(identity, alias);
  checkReservedAlias(identity, alias);
}

/** Validates a projection directory name: one tree-safe segment without ":" or "$". */
export function checkDirectoryAlias(identity: string, alias: string): void {
  checkAliasInput(identity, alias);
  if (/[/:$]/.test(alias)) throw invalid(`directory alias ${JSON.stringify(alias)} is not one segment without ":" or "$"`);
  const reason = segmentViolation(alias);
  if (reason !== "") throw invalid(`directory alias ${JSON.stringify(alias)} ${reason}`);
  checkReservedAlias(identity, alias);
}

/** Group key of a directory alias: only ASCII A-Z mapped to a-z. */
export function directoryAliasKey(alias: string): string {
  return asciiLower(alias);
}
