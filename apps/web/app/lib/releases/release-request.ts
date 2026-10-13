/**
 * Boundary validation of a release upload: the package name from the URL,
 * the `X-SkillX-Release` metadata header and the capped tar body. Nothing
 * here touches storage.
 */
import { PACKAGE_KINDS, PACKAGE_NAME_PATTERN, RELEASE_CHANNELS, RELEASE_VERSION_PATTERN } from "@skillx/contracts";
import type { PackageKind, ReleaseChannel, ReleaseSourceProvenance } from "@skillx/contracts";
import { ERROR_CODES, SkillTreeError, checkDirectoryAlias, checkPublisher, validateIdentity } from "@skillx/skill-tree";
import { releaseError } from "./release-http";
import { MAX_RELEASE_METADATA_HEADER_BYTES } from "./release-limits";

export const RELEASE_METADATA_HEADER = "X-SkillX-Release";
export const RELEASE_CONTENT_TYPE = "application/x-tar";

export interface ReleaseName {
  identity: string;
  handle: string;
  slug: string;
}

export interface ReleaseMetadata {
  version: string;
  channel: ReleaseChannel;
  kind: PackageKind;
  sourceProvenance: ReleaseSourceProvenance | null;
  declaredScripts: string[];
}

const METADATA_FIELDS = new Set(["version", "channel", "kind", "sourceProvenance", "declaredScripts"]);
/** The AgentKit alias prefixes (`ak-plan`, `ak:plan`), compared with ASCII case folding. */
const RESERVED_ALIAS_PREFIX = /^ak[-:]/i;

function treeErrorToHttp(error: SkillTreeError) {
  const reserved = error.code === ERROR_CODES.identityReservedPublisher || error.code === ERROR_CODES.identityReservedAlias;
  return releaseError(reserved ? 403 : 400, error.code, error.message);
}

/**
 * Parses `@handle/slug` from the route. `@agentkit/*` and the `ak-`/`ak:`
 * alias forms are reserved for AgentKit kit content and fail with 403 before
 * any other check; a malformed name fails with 400.
 */
export function parseReleaseName(scope: string | undefined, slug: string | undefined): ReleaseName {
  if (!scope?.startsWith("@") || !slug) {
    throw releaseError(400, ERROR_CODES.identityInvalid, "package name must be @publisher/slug");
  }
  const handle = scope.slice(1);
  if (handle.toLowerCase() === "agentkit") {
    throw releaseError(403, ERROR_CODES.identityReservedPublisher, "the @agentkit publisher is reserved for AgentKit kit content");
  }
  if (RESERVED_ALIAS_PREFIX.test(slug)) {
    throw releaseError(403, ERROR_CODES.identityReservedAlias, "names starting with ak- or ak: are reserved for AgentKit kit content");
  }
  const identity = `${scope}/${slug}`;
  if (!PACKAGE_NAME_PATTERN.test(identity)) {
    throw releaseError(400, ERROR_CODES.identityInvalid, "package name must be @publisher/slug in lowercase");
  }
  try {
    validateIdentity(identity);
    checkPublisher(identity, "skillx");
    checkDirectoryAlias(identity, slug);
  } catch (error) {
    if (error instanceof SkillTreeError) throw treeErrorToHttp(error);
    throw error;
  }
  return { identity, handle, slug };
}

function invalidMetadata(message: string) {
  return releaseError(400, "release.invalid_metadata", message);
}

function decodeMetadataHeader(header: string | null): Record<string, unknown> {
  if (header === null || header.trim() === "") throw invalidMetadata(`${RELEASE_METADATA_HEADER} header is required`);
  if (header.length > MAX_RELEASE_METADATA_HEADER_BYTES) throw invalidMetadata(`${RELEASE_METADATA_HEADER} header is too large`);
  let parsed: unknown;
  try {
    const bytes = Uint8Array.from(atob(header.trim()), (c) => c.charCodeAt(0));
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalidMetadata(`${RELEASE_METADATA_HEADER} must be base64 of a UTF-8 JSON object`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw invalidMetadata(`${RELEASE_METADATA_HEADER} must be base64 of a UTF-8 JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T, field: string): T {
  if (value === undefined) return fallback;
  if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as T;
  throw invalidMetadata(`${field} must be one of: ${values.join(", ")}`);
}

/**
 * Reads the metadata header. Only the shape is checked here; the signed
 * manifest validator re-checks every value (provenance URL and commit,
 * scripts against the tree) before anything is stored.
 */
export function parseReleaseMetadata(header: string | null): ReleaseMetadata {
  const raw = decodeMetadataHeader(header);
  const unknown = Object.keys(raw).filter((key) => !METADATA_FIELDS.has(key));
  if (unknown.length > 0) throw invalidMetadata(`unknown metadata field: ${unknown.join(", ")}`);
  if (typeof raw.version !== "string" || raw.version.length > 128 || !RELEASE_VERSION_PATTERN.test(raw.version)) {
    throw invalidMetadata("version must be a SemVer 2.0 version without build metadata, such as 1.0.0");
  }
  const provenance = raw.sourceProvenance ?? null;
  if (provenance !== null && (typeof provenance !== "object" || Array.isArray(provenance))) {
    throw invalidMetadata("sourceProvenance must be an object or null");
  }
  const scripts = raw.declaredScripts ?? [];
  if (!Array.isArray(scripts) || !scripts.every((s) => typeof s === "string")) {
    throw invalidMetadata("declaredScripts must be an array of file paths");
  }
  return {
    version: raw.version,
    channel: oneOf(RELEASE_CHANNELS, raw.channel, "stable", "channel"),
    kind: oneOf(PACKAGE_KINDS, raw.kind, "skill", "kind"),
    sourceProvenance: provenance as ReleaseSourceProvenance | null,
    declaredScripts: scripts as string[],
  };
}

/** Reads the uncompressed tar body, failing with 413 as soon as it exceeds `max` bytes. */
export async function readUploadBody(request: Request, max: number): Promise<Uint8Array> {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== RELEASE_CONTENT_TYPE) {
    throw releaseError(415, "release.unsupported_media_type", `body must be an uncompressed tar (${RELEASE_CONTENT_TYPE})`);
  }
  const declared = Number(request.headers.get("Content-Length") ?? "NaN");
  const tooLarge = () => releaseError(413, ERROR_CODES.limitExceeded, `upload exceeds ${max} bytes`);
  if (Number.isFinite(declared) && declared > max) throw tooLarge();
  if (request.body === null) throw releaseError(400, ERROR_CODES.readFailed, "upload body is empty");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  if (total === 0) throw releaseError(400, ERROR_CODES.readFailed, "upload body is empty");
  const body = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.length;
  }
  return body;
}
