/**
 * Publish-time check of the optional `agentkit-exec.json` exec manifest. A
 * malformed manifest, or one naming a script the publisher did not declare,
 * rejects the upload with 422 before anything is signed or stored. A valid
 * one yields the capability summary kept with the release row.
 */
import { EXEC_MANIFEST_PATH, summarizeExecManifest, validateExecManifest } from "@skillx/contracts";
import type { ExecManifestSummary } from "@skillx/contracts";
import { releaseError } from "./release-http";

const MAX_DETAIL_ISSUES = 10;

export async function checkExecManifest(
  contents: ReadonlyMap<string, Uint8Array>,
  declaredScripts: readonly string[],
): Promise<ExecManifestSummary | null> {
  const bytes = contents.get(EXEC_MANIFEST_PATH);
  if (bytes === undefined) return null;
  const result = validateExecManifest(bytes, { files: new Set(contents.keys()), declaredScripts });
  if (!result.ok) {
    const shown = result.issues.slice(0, MAX_DETAIL_ISSUES).map((i) => `${i.path || "(root)"} ${i.code}`);
    const more = result.issues.length > MAX_DETAIL_ISSUES ? `, and ${result.issues.length - MAX_DETAIL_ISSUES} more` : "";
    throw releaseError(422, result.code, `${EXEC_MANIFEST_PATH} is invalid: ${shown.join(", ")}${more}`);
  }
  return summarizeExecManifest(result.manifest, bytes as Uint8Array<ArrayBuffer>);
}
