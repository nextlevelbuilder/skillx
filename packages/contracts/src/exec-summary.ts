/**
 * The parsed capability summary SkillX stores with a release that carries
 * `agentkit-exec.json`. It is a convenience index for review and policy; the
 * manifest file inside the digest-covered tree stays the authority.
 */
import { execCapabilityDigest, EXEC_MANIFEST_PATH, SKILL_EXEC_SCHEMA_VERSION } from "./exec-manifest";
import type { ExecDependencies, ExecInterpreter, ExecManifest } from "./exec-manifest";
import { sha256Digest } from "./release-signature";

export interface ExecEntrypointSummary {
  name: string;
  path: string;
  interpreter: ExecInterpreter;
  capabilityDigest: string;
  networkHosts: string[];
  subprocess: boolean;
  secrets: string[];
  write: string[];
}

export interface ExecManifestSummary {
  validated: true;
  schemaVersion: typeof SKILL_EXEC_SCHEMA_VERSION;
  path: typeof EXEC_MANIFEST_PATH;
  /** sha256 of the manifest file bytes as stored in the tree. */
  fileDigest: string;
  dependencies: ExecDependencies;
  entrypoints: ExecEntrypointSummary[];
}

/** A manifest of a newer schema major than this validator knows: stored, never interpreted. */
export interface ExecUnvalidatedSummary {
  validated: false;
  schema: string;
  path: typeof EXEC_MANIFEST_PATH;
  fileDigest: string;
}

export type ExecSummary = ExecManifestSummary | ExecUnvalidatedSummary;

export async function summarizeUnvalidatedExec(schema: string, bytes: Uint8Array<ArrayBuffer>): Promise<ExecUnvalidatedSummary> {
  return { validated: false, schema, path: EXEC_MANIFEST_PATH, fileDigest: await sha256Digest(bytes) };
}

/** Summarizes a manifest that `validateExecManifest` accepted. */
export async function summarizeExecManifest(manifest: ExecManifest, bytes: Uint8Array<ArrayBuffer>): Promise<ExecManifestSummary> {
  const entrypoints = await Promise.all(
    manifest.entrypoints.map(async (entry) => ({
      name: entry.name,
      path: entry.path,
      interpreter: entry.interpreter,
      capabilityDigest: await execCapabilityDigest(entry),
      networkHosts: entry.capabilities.network.hosts,
      subprocess: entry.capabilities.subprocess,
      secrets: entry.capabilities.secrets,
      write: entry.capabilities.filesystem.write,
    })),
  );
  return {
    validated: true,
    schemaVersion: SKILL_EXEC_SCHEMA_VERSION,
    path: EXEC_MANIFEST_PATH,
    fileDigest: await sha256Digest(bytes),
    dependencies: manifest.dependencies ?? { kind: "none" },
    entrypoints,
  };
}
