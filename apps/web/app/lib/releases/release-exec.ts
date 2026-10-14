/**
 * Publish-time check of the optional `agentkit-exec.json` exec manifest. A
 * malformed v1 manifest, or one naming a script the publisher did not
 * declare, rejects the upload with 422 before anything is signed or stored.
 * A valid one yields the capability summary kept with the release row. A
 * newer schema major is stored unvalidated with a warning, so SkillX never
 * blocks a publish on lagging AgentKit's schema.
 */
import { EXEC_MANIFEST_PATH, summarizeExecManifest, summarizeUnvalidatedExec, validateExecManifest } from "@skillx/contracts";
import type { ExecSummary } from "@skillx/contracts";
import { releaseError } from "./release-http";

const MAX_DETAIL_ISSUES = 10;

export interface PublishWarning {
  code: string;
  message: string;
}

export interface ExecCheck {
  summary: ExecSummary | null;
  warnings: PublishWarning[];
}

export async function checkExecManifest(contents: ReadonlyMap<string, Uint8Array>, declaredScripts: readonly string[]): Promise<ExecCheck> {
  const bytes = contents.get(EXEC_MANIFEST_PATH) as Uint8Array<ArrayBuffer> | undefined;
  if (bytes === undefined) return { summary: null, warnings: [] };
  const result = validateExecManifest(bytes, { files: new Set(contents.keys()), declaredScripts });
  if (!result.ok) {
    const shown = result.issues.slice(0, MAX_DETAIL_ISSUES).map((i) => `${i.path || "(root)"} ${i.code}`);
    const more = result.issues.length > MAX_DETAIL_ISSUES ? `, and ${result.issues.length - MAX_DETAIL_ISSUES} more` : "";
    throw releaseError(422, result.code, `${EXEC_MANIFEST_PATH} is invalid: ${shown.join(", ")}${more}`);
  }
  if (result.manifest === null) {
    return {
      summary: await summarizeUnvalidatedExec(result.schemaVersion, bytes),
      warnings: [{ code: "exec.schema_unvalidated", message: `${EXEC_MANIFEST_PATH} uses ${result.schemaVersion}, which SkillX stores without validation` }],
    };
  }
  return { summary: await summarizeExecManifest(result.manifest, bytes), warnings: [] };
}