/**
 * The `prepare_install` MCP handler: what a person needs to decide whether to
 * install one registry release, and how to do it safely. It never installs.
 *
 * The answer is pinned to one immutable release (`@publisher/slug@version`
 * plus its tree digest) and fails closed, with a sentence a person can read,
 * when the release is unknown, private, quarantined, yanked, from a revoked
 * publisher, no longer matches a digest the caller pinned, or when its signed
 * manifest names another package or version than the registry row.
 *
 * Two kinds of host read it. A read-only host (a ChatGPT app) cannot install:
 * it gets links and manual steps, and `installed` is always false. An
 * installer-capable host gets a dry-run preview command and the pinned install
 * command, to run only after the person approved the preview. In both cases
 * the server runs nothing and installing never runs a script.
 */

import type { ExecSummary, SkillxReleaseManifest } from "@skillx/contracts";
import { resolveReleaseByVersion } from "~/lib/releases/release-access";
import type { ReadableRelease } from "~/lib/releases/release-access";
import { ReleaseHttpError } from "~/lib/releases/release-http";
import { readManifest } from "~/lib/releases/release-read";
import { releasesApiEnabled } from "~/lib/releases/release-limits";
import { ToolInputError, asRecord } from "./protocol";
import { optionalString } from "./args";
import type { ToolContext } from "./handlers";
import { readReleaseArgs, releaseFailure } from "./handlers-releases";
import { UNTRUSTED_CONTENT_NOTICE, manifestRedFlags } from "./trust";

const HOSTS = ["read_only", "installer"] as const;
type Host = (typeof HOSTS)[number];

/** Most executable paths named in one answer; the count is always exact. */
export const MAX_LISTED_EXECUTABLES = 50;

async function readExecSummary(db: D1Database, releaseId: string): Promise<ExecSummary | null> {
  const row = await db.prepare("SELECT exec_summary_json FROM package_releases WHERE id = ?").bind(releaseId).first<{ exec_summary_json: string | null }>();
  if (!row?.exec_summary_json) return null;
  try {
    return JSON.parse(row.exec_summary_json) as ExecSummary;
  } catch {
    // An unreadable summary is reported as an unvalidated exec manifest, never as "no scripts".
    return { validated: false, schema: "unknown", path: "agentkit-exec.json", fileDigest: "unknown" } as ExecSummary;
  }
}

function hostSteps(host: Host, ref: string, links: { release: string; manifest: string }) {
  if (host === "installer") {
    return {
      mode: "installer" as const,
      preview: `skillx install --dry-run ${ref}`,
      command: `skillx install ${ref}`,
      steps: [
        "Show the person this plan, the red flags and the dry-run preview.",
        "Run the install command only after the person explicitly approves it.",
        "The CLI verifies the signed manifest and the pinned digest, and refuses a mismatch.",
      ],
    };
  }
  return {
    mode: "manual" as const,
    installed: false,
    links,
    steps: [
      "This host cannot install skills; nothing was installed.",
      `Review the signed manifest at ${links.manifest}.`,
      `To install, run \`skillx install ${ref}\` in a terminal after reviewing it.`,
    ],
  };
}

export async function prepareInstall(rawArgs: unknown, ctx: ToolContext) {
  const args = asRecord(rawArgs);
  const { identity, version, digest } = readReleaseArgs(args);
  if (version === undefined) throw new ToolInputError("version is required: an install is pinned to one immutable release");
  const rawHost = optionalString(args, "host") ?? "read_only";
  if (!(HOSTS as readonly string[]).includes(rawHost)) throw new ToolInputError(`host must be one of ${HOSTS.join(", ")}`);
  const host = rawHost as Host;
  const pinned = { version };

  if (!releasesApiEnabled(ctx.env)) return { installable: false, ...releaseFailure("not_found", identity, pinned) };

  let release: ReadableRelease;
  let manifest: SkillxReleaseManifest;
  try {
    release = await resolveReleaseByVersion(ctx.env.DB, identity, version, null);
    if (release.state !== "published") return { installable: false, ...releaseFailure("release_not_installable", identity, pinned) };
    if (digest !== undefined && digest !== release.releaseDigest) return { installable: false, ...releaseFailure("digest_mismatch", identity, pinned) };
    // Also refuses a manifest whose digest differs from the row's.
    manifest = await readManifest(ctx.env.R2, release, "prepare_install");
  } catch (error) {
    if (error instanceof ReleaseHttpError) return { installable: false, ...releaseFailure(error.code, identity, pinned) };
    throw error;
  }
  // The stored manifest must describe the row that pointed at it; anything else is a substituted origin.
  if (manifest.identity !== release.identity || manifest.version !== release.version) {
    return { installable: false, ...releaseFailure("origin_mismatch", identity, pinned) };
  }
  const exec = await readExecSummary(ctx.env.DB, release.id);
  const executables = manifest.files.filter((f) => f.mode === "100755").map((f) => f.path);

  // The CLI refuses to install when the resolved digest differs from the one after `#`.
  const ref = `${release.identity}@${release.version}#${release.releaseDigest}`;
  const base = ctx.origin ?? "";
  const query = `package=${encodeURIComponent(release.identity)}&version=${encodeURIComponent(release.version)}`;
  const links = {
    release: `${base}/api/v1/packages/${release.identity}/releases/${release.version}`,
    manifest: `${base}/api/v1/releases/${release.releaseDigest}/manifest?${query}`,
  };

  return {
    installable: true,
    package: release.identity,
    version: release.version,
    releaseDigest: release.releaseDigest,
    trust: {
      kind: "immutable_release" as const,
      signed: true,
      channel: release.channel,
      publisher: manifest.publisher,
      sourceProvenance: manifest.sourceProvenance ?? ("unknown" as const),
      fileCount: manifest.fileCount,
      treeSize: manifest.treeSize,
      declaredScripts: manifest.declaredScripts,
      executableFiles: { count: executables.length, paths: executables.slice(0, MAX_LISTED_EXECUTABLES) },
      permissions: exec ?? ("none_declared" as const),
    },
    redFlags: manifestRedFlags(manifest, exec),
    approval: {
      required: true,
      executedByServer: false,
      scriptsRunOnInstall: false,
      pin: { package: release.identity, version: release.version, releaseDigest: release.releaseDigest },
    },
    host: hostSteps(host, ref, links),
    contentTrust: UNTRUSTED_CONTENT_NOTICE,
  };
}
