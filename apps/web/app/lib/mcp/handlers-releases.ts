/**
 * The `get_release` MCP handler.
 *
 * It reads through the same access module as the public release API
 * (`lib/releases/release-access`), so it reaches the same answer for the same
 * inputs: the flag off, an unknown package, a private package, a draft or a row
 * without a signed manifest are all `not_found`; a quarantined tree is
 * `release_quarantined`; a suspended or revoked publisher is `publisher_revoked`;
 * a yanked version is `release_yanked`. The MCP caller is always the anonymous
 * viewer: this tool never reads entitlements, so a private package is never
 * visible through it.
 *
 * The fields returned are exactly the fields of
 * `GET /api/v1/packages/@handle/slug/releases`.
 */

import {
  listPackageReleases,
  parsePackageIdentity,
  parseReleaseDigest,
  parseReleaseVersion,
  resolveReleaseByVersion,
} from "~/lib/releases/release-access";
import type { ReadableRelease } from "~/lib/releases/release-access";
import { ReleaseHttpError } from "~/lib/releases/release-http";
import { releasesApiEnabled } from "~/lib/releases/release-limits";
import { ToolInputError, asRecord } from "./protocol";
import { optionalString, requiredString } from "./args";
import type { ToolContext } from "./handlers";
import { explainFailure } from "./trust";

/** Most releases one `get_release` listing returns (newest first). */
export const MAX_MCP_RELEASES = 20;

/** Anonymous viewer: no entitlement can ever match. */
const ANONYMOUS = null;

export interface PublicRelease {
  version: string;
  channel: string;
  state: string;
  releaseDigest: string;
  artifactDigest: string | null;
  artifactSize: number | null;
  createdAt: string;
}

/** The public release list item, field for field. */
export function toPublicRelease(release: ReadableRelease): PublicRelease {
  return {
    version: release.version,
    channel: release.channel,
    state: release.state,
    releaseDigest: release.releaseDigest,
    artifactDigest: release.artifactDigest,
    artifactSize: release.artifactSize,
    createdAt: new Date(release.createdAt).toISOString(),
  };
}

/** A release is immutable: its pin is the version plus the tree digest, and it is registry-signed. */
export function releaseTrust(identity: string, release: ReadableRelease) {
  return {
    kind: "immutable_release" as const,
    immutable: true,
    signed: true,
    pinned: { package: identity, version: release.version, releaseDigest: release.releaseDigest },
    state: release.state,
  };
}

/** A stable failure: the code, a sentence a person can read, and nothing else. */
export function releaseFailure(code: string, identity: string, pinned: Record<string, string>) {
  return { found: false, code, explanation: explainFailure(code), package: identity, ...pinned };
}

/** `@handle/slug`, an optional SemVer and an optional pinned digest, validated by the release API's own parsers. */
export function readReleaseArgs(args: Record<string, unknown>): { identity: string; version: string | undefined; digest: string | undefined } {
  const name = requiredString(args, "package");
  const version = optionalString(args, "version");
  const digest = optionalString(args, "digest");
  if (digest !== undefined && version === undefined) throw new ToolInputError("digest pins one version; pass version too");
  const slash = name.indexOf("/");
  try {
    const identity = parsePackageIdentity(
      slash < 0 ? name : name.slice(0, slash),
      slash < 0 ? undefined : name.slice(slash + 1),
    );
    if (version !== undefined) parseReleaseVersion(version);
    if (digest !== undefined) parseReleaseDigest(digest);
    return { identity, version, digest };
  } catch (error) {
    if (error instanceof ReleaseHttpError) throw new ToolInputError(error.message);
    throw error;
  }
}

export async function getRelease(rawArgs: unknown, ctx: ToolContext) {
  const { identity, version, digest } = readReleaseArgs(asRecord(rawArgs));
  const pinned: Record<string, string> = version === undefined ? {} : { version };

  // Flag off answers like an unknown package, as the public API does.
  if (!releasesApiEnabled(ctx.env)) return releaseFailure("not_found", identity, pinned);

  try {
    if (version !== undefined) {
      const release = await resolveReleaseByVersion(ctx.env.DB, identity, version, ANONYMOUS);
      // A pinned digest that no longer matches fails closed: the bytes changed since review.
      if (digest !== undefined && digest !== release.releaseDigest) return releaseFailure("digest_mismatch", identity, pinned);
      return { found: true, package: release.identity, release: toPublicRelease(release), trust: releaseTrust(release.identity, release) };
    }
    const list = await listPackageReleases(ctx.env.DB, identity, ANONYMOUS);
    return {
      found: true,
      package: list.identity,
      releases: list.releases.slice(0, MAX_MCP_RELEASES).map(toPublicRelease),
    };
  } catch (error) {
    // Access decisions keep the release API's stable codes; the message is not forwarded.
    if (error instanceof ReleaseHttpError) return releaseFailure(error.code, identity, pinned);
    throw error;
  }
}
