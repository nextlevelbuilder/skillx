/**
 * Release ingest: `POST /api/v1/packages/@handle/slug/releases`.
 *
 * Order (each step rejects before any later one runs):
 * name and reserved namespaces (for the provider the metadata asks for) -> scoped key and publisher ownership ->
 * signing key -> metadata -> capped upload -> tar read with limits and tree
 * digest -> version conflict -> subrequest budget -> exec manifest -> scan -> signed manifest -> R2 artifact, blobs
 * and manifest (create-only) -> D1 row (last). Release bytes are stored
 * exactly as uploaded; nothing is sanitized.
 *
 * Kit releases: metadata `provenance: {provider: "kit", origin}` is the only
 * way to publish `@agentkit/*`. It still needs a key scoped
 * `releases:publish:@agentkit` whose owner owns the active, admin-provisioned
 * `agentkit` publisher, and it is signed as `skillx.release/v2`. Every other
 * release is signed as `skillx.release/v1`.
 */
import { ReleaseManifestError } from "@skillx/contracts";
import { ERROR_CODES, SkillTreeError, readTarTree } from "@skillx/skill-tree";
import type { TreeManifest } from "@skillx/skill-tree";
import { authorizeReleasePublisher, type AuthorizedPublisher } from "./release-auth";
import { checkExecManifest } from "./release-exec";
import { ReleaseHttpError, errorResponse, releaseError } from "./release-http";
import { BLOB_WRITE_CONCURRENCY, MAX_RELEASE_UPLOAD_BYTES, RELEASE_SERVER_TREE_LIMITS, assertSubrequestBudget } from "./release-limits";
import { RELEASE_METADATA_HEADER, parseReleaseMetadata, parseReleaseName, readUploadBody, requestedProvider } from "./release-request";
import { scanRelease } from "./release-scan";
import { findPackage, findRelease, insertRelease } from "./release-store";
import type { ExistingRelease } from "./release-store";
import { artifactKey, blobKey, forEachLimited, manifestKey, putCreateOnly } from "./r2-create-only";
import { manifestSchemaVersionOf, signRelease } from "./sign-manifest";
import type { RegistrySigner } from "./sign-manifest";

export interface IngestDeps {
  db: D1Database;
  bucket: R2Bucket;
  loadSigner: () => Promise<RegistrySigner>;
  now?: () => Date;
  /** Subrequests one publish may spend; defaults to DEFAULT_RELEASE_SUBREQUEST_BUDGET. */
  subrequestBudget?: number;
  /** `SKILLX_TOKEN_SECRET`; enables OIDC publish tokens (`sxo_...`). */
  tokenSecret?: string | null;
}

/** What the idempotent route already read and authorized, so ingest neither buffers the body nor authenticates twice. */
export type PreparedUpload = { auth: AuthorizedPublisher; body: Uint8Array };
type Params = { scope?: string; slug?: string };

interface ReadTree {
  tree: TreeManifest;
  contents: Map<string, Uint8Array>;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Streams the uncompressed tar through the shared reader; every unsafe entry fails here, before storage. */
async function readTree(body: Uint8Array): Promise<ReadTree> {
  const seen = new Map<string, Uint8Array>();
  try {
    const tree = await readTarTree(body, {
      compression: "none",
      limits: RELEASE_SERVER_TREE_LIMITS,
      onFileContent: (path, content) => void seen.set(path, content),
    });
    const contents = new Map<string, Uint8Array>();
    for (const file of tree.files) {
      const bytes = seen.get(file.path);
      if (bytes === undefined || bytes.length !== file.size) throw new Error(`tree reader lost the content of ${file.path}`);
      contents.set(file.path, bytes);
    }
    return { tree, contents };
  } catch (error) {
    if (!(error instanceof SkillTreeError)) throw error;
    throw releaseError(error.code === ERROR_CODES.limitExceeded ? 413 : 422, error.code, error.message);
  }
}

function existingOutcome(identity: string, version: string, existing: ExistingRelease, releaseDigest: string): Response {
  if (existing.releaseDigest !== releaseDigest) {
    throw releaseError(409, "release.version_exists", `${identity}@${version} already exists with different content`);
  }
  return Response.json({
    identity,
    version,
    releaseDigest,
    artifactDigest: existing.artifactDigest,
    state: existing.state,
    manifestKey: existing.manifestKey,
    created: false,
  });
}

async function ingest(request: Request, params: Params, deps: IngestDeps, prepared?: PreparedUpload): Promise<Response> {
  const header = request.headers.get(RELEASE_METADATA_HEADER);
  const name = parseReleaseName(params.scope, params.slug, requestedProvider(header));
  const auth = prepared?.auth ?? (await authorizeReleasePublisher(deps.db, request, name.handle, { tokenSecret: deps.tokenSecret, now: deps.now?.() }));
  const signer = await deps.loadSigner();
  const metadata = parseReleaseMetadata(header);
  const pkg = await findPackage(deps.db, name.identity);
  if (pkg !== null && pkg.publisherId !== auth.publisherId) {
    throw releaseError(403, "publisher.not_owner", `${name.identity} belongs to another publisher`);
  }
  if (pkg !== null && pkg.kind !== metadata.kind) {
    throw releaseError(409, "release.kind_conflict", `${name.identity} is a ${pkg.kind} package, not ${metadata.kind}`);
  }

  const body = prepared?.body ?? (await readUploadBody(request, MAX_RELEASE_UPLOAD_BYTES));
  const { tree, contents } = await readTree(body);
  const existing = await findRelease(deps.db, name.identity, metadata.version);
  if (existing !== null) return existingOutcome(name.identity, metadata.version, existing, tree.digest);

  // Budget first: an oversized publish is refused before the scan reads or the signer touches anything.
  const blobs = [...new Map(tree.files.map((f) => [f.sha256, contents.get(f.path)!])).entries()];
  assertSubrequestBudget(blobs.length, deps.subrequestBudget);

  const exec = await checkExecManifest(contents, metadata.declaredScripts);
  const scan = scanRelease(tree.files.map((f) => ({ path: f.path, bytes: contents.get(f.path)! })));
  const artifactHex = await sha256Hex(body);
  const now = deps.now?.() ?? new Date();
  let signed: Awaited<ReturnType<typeof signRelease>>;
  try {
    signed = await signRelease(
      {
        identity: name.identity,
        version: metadata.version,
        channel: metadata.channel,
        kind: metadata.kind,
        releaseDigest: tree.digest,
        artifactDigest: `sha256:${artifactHex}`,
        artifactSize: body.length,
        files: tree.files.map((f) => ({ path: f.path, mode: f.mode, sha256: f.sha256, size: f.size })),
        fileCount: tree.files.length,
        treeSize: tree.files.reduce((sum, f) => sum + f.size, 0),
        // Publisher handles are provisioned by registry administrators.
        publisher: { handle: name.handle, verifiedBy: "admin" },
        sourceProvenance: metadata.sourceProvenance,
        declaredScripts: metadata.declaredScripts,
        provenance: metadata.provenance,
      },
      signer,
      now,
    );
  } catch (error) {
    if (!(error instanceof ReleaseManifestError)) throw error;
    const detail = error.issues.map((i) => `${i.path} ${i.code}`).join(", ");
    throw releaseError(400, "release.invalid_metadata", `release metadata is invalid: ${detail}`);
  }
  const manifestHex = await sha256Hex(signed.bytes);
  await putCreateOnly(deps.bucket, artifactKey(artifactHex), body, {
    sha256Hex: artifactHex,
    contentType: "application/x-tar",
    verifyExisting: true,
  });
  await forEachLimited(blobs, BLOB_WRITE_CONCURRENCY, ([hex, bytes]) =>
    putCreateOnly(deps.bucket, blobKey(hex), bytes, { sha256Hex: hex, contentType: "application/octet-stream" }),
  );
  await putCreateOnly(deps.bucket, manifestKey(manifestHex), signed.bytes, {
    sha256Hex: manifestHex,
    contentType: "application/json",
    verifyExisting: true,
  });

  const outcome = await insertRelease(deps.db, {
    publisherId: auth.publisherId,
    identity: name.identity,
    slug: name.slug,
    kind: metadata.kind,
    version: metadata.version,
    channel: metadata.channel,
    state: scan.state,
    manifestSchemaVersion: manifestSchemaVersionOf(metadata),
    artifactKey: artifactKey(artifactHex),
    artifactDigest: `sha256:${artifactHex}`,
    artifactSize: body.length,
    releaseDigest: tree.digest,
    fileCount: signed.manifest.fileCount,
    treeSize: signed.manifest.treeSize,
    manifestKey: manifestKey(manifestHex),
    sourceProvenance: metadata.sourceProvenance,
    execSummary: exec.summary,
    createdAt: now.getTime(),
  });
  if (outcome === "conflict") {
    const winner = await findRelease(deps.db, name.identity, metadata.version);
    // The release insert matched no package row: one with this name was created concurrently by another publisher or kind.
    if (winner === null) throw releaseError(409, "release.kind_conflict", `${name.identity} was created concurrently with another kind or publisher`);
    return existingOutcome(name.identity, metadata.version, winner, tree.digest);
  }
  return Response.json({
    identity: name.identity,
    version: metadata.version,
    releaseDigest: tree.digest,
    artifactDigest: `sha256:${artifactHex}`,
    state: scan.state,
    manifestKey: manifestKey(manifestHex),
    keyId: signer.keyId,
    created: true,
    findings: scan.findings,
    exec: exec.summary,
    warnings: exec.warnings,
  });
}

/** Handles one upload; every failure becomes a JSON error with a stable code. */
export async function ingestRelease(request: Request, params: Params, deps: IngestDeps, prepared?: PreparedUpload): Promise<Response> {
  try {
    return await ingest(request, params, deps, prepared);
  } catch (error) {
    if (error instanceof ReleaseHttpError) return errorResponse(error);
    console.error("release publish failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "release.internal_error", "release publish failed"));
  }
}
