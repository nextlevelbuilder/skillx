/**
 * MCP tool catalog and dispatch.
 *
 * Descriptions are load-bearing: they are the only thing an agent reads before
 * choosing a tool, so each one states what the tool does *and* what it will not
 * do — notably that `unknown` compatibility is not support and that
 * `--compatible`/`compatible` is runtime-only. An optimistic description here
 * would produce confident wrong answers downstream.
 */

import { HANDLERS, type ToolContext, type ToolName } from "./handlers";
import { ToolCodedError, ToolInputError, asRecord, errorResult, textResult, type ToolResult } from "./protocol";

export interface McpToolDefinition {
  name: ToolName;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
}

const STRING = { type: "string" } as const;
const LIMIT = { type: "number", minimum: 1, maximum: 100 } as const;

export const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "search_packages",
    title: "Search packages",
    description:
      "Search the SkillX catalog with hybrid semantic + keyword ranking. " +
      "Set `compatible` to a runtime name to keep only listings that declare that runtime; " +
      "listings that declare nothing are excluded and counted in `compatibilityFilter.undecided`, " +
      "so an empty or short result is explained in the response rather than silent. " +
      "`compatible` takes a runtime only, not a version.",
    inputSchema: {
      type: "object",
      properties: { query: STRING, category: STRING, compatible: STRING, limit: LIMIT },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_package",
    title: "Get package",
    description:
      "Fetch one listing by slug: metadata, references, scripts, and its declared compatibility. " +
      "Pass `target` as `runtime` or `runtime@version` to also get the resolved answer for that " +
      "runtime. Sets `contentIncluded` to say whether the SKILL.md body is part of this response; " +
      "a protected listing answers without its body rather than with an empty one.",
    inputSchema: {
      type: "object",
      properties: { slug: STRING, target: STRING },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_release",
    title: "Get release",
    description:
      "Read the published releases of a public registry package (`package` is `@publisher/slug`), " +
      "newest first, or resolve one `version`. Uses the same access rules as the public release " +
      "API: private, unknown and draft releases answer `found: false` with code `not_found`; a " +
      "quarantined tree answers `release_quarantined`, a revoked publisher `publisher_revoked`, " +
      "and a yanked version `release_yanked`; every failure carries a readable `explanation`. Pass " +
      "`digest` with `version` to pin the reviewed tree: a different digest answers `digest_mismatch`. " +
      "Fields match `GET /api/v1/packages/:scope/:slug/releases`.",
    inputSchema: {
      type: "object",
      properties: { package: STRING, version: STRING, digest: STRING },
      required: ["package"],
      additionalProperties: false,
    },
  },
  {
    name: "check_compatibility",
    title: "Check compatibility",
    description:
      "Ask whether one listing supports a specific `runtime` or `runtime@version`. Returns the " +
      "status plus machine-readable reason codes. Only `declared` and `verified` mean support; " +
      "`unknown` means no claim was ever made and must not be read as compatibility. `verified` " +
      "requires evidence bound to the exact artifact digest, so a mutable listing can never reach it.",
    inputSchema: {
      type: "object",
      properties: { slug: STRING, target: STRING },
      required: ["slug", "target"],
      additionalProperties: false,
    },
  },
  {
    name: "get_kit",
    title: "Get kit",
    description:
      "Read one personal kit (`kit` is `@handle/name`) and its effective revision. The owner, " +
      "authenticated with a web session or an unscoped API key, reads their own kit (private too) " +
      "with the full revision document. Anyone else sees a public kit whose effective revision was " +
      "authored public and activated by its owner as metadata and revision digest only. Every other " +
      "kit, drafts and proposals included, answers `found: false` with code `not_found`; a suspended " +
      "or revoked publisher answers `publisher_revoked`. When personal kits are turned off on this " +
      "server the call fails with code `feature_disabled`.",
    inputSchema: {
      type: "object",
      properties: { kit: STRING },
      required: ["kit"],
      additionalProperties: false,
    },
  },
  {
    name: "prepare_install",
    title: "Prepare install",
    description:
      "Prepare a person's decision to install one published release (`package` is `@publisher/slug`, " +
      "`version` is required, optional `digest` pins the reviewed tree). Returns the signed provenance " +
      "(publisher verification, source commit or `unknown`), declared scripts, executable files, declared " +
      "permissions, red flags and the pinned reference. It installs nothing and runs nothing. `host` is " +
      "`read_only` (default; manual steps and links, `installed: false`) or `installer` (a dry-run preview " +
      "and the pinned command to run only after explicit approval). Quarantined, yanked, revoked, private, " +
      "changed-digest or mismatched releases answer `installable: false` with a code and an explanation.",
    inputSchema: {
      type: "object",
      properties: { package: STRING, version: STRING, digest: STRING, host: { type: "string", enum: ["read_only", "installer"] } },
      required: ["package", "version"],
      additionalProperties: false,
    },
  },
];

/** The only failure detail a caller sees when a handler throws unexpectedly. */
export const TOOL_INTERNAL_ERROR = "internal_error";

export const TOOL_NAMES: string[] = TOOL_DEFINITIONS.map((tool) => tool.name);

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(HANDLERS, name);
}

/**
 * Runs one tool. Argument problems and handler failures come back as tool
 * results with `isError`, because the call itself succeeded and the agent needs
 * the reason; only an unknown tool name is reported as such.
 */
export async function callTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!isToolName(name)) {
    // The requested name is not echoed: it is arbitrary caller input.
    return errorResult("Unknown tool", { code: "unknown_tool", availableTools: TOOL_NAMES });
  }

  try {
    return textResult(await HANDLERS[name](asRecord(rawArgs), ctx));
  } catch (error) {
    if (error instanceof ToolInputError) return errorResult(error.message, { code: "invalid_arguments" });
    if (error instanceof ToolCodedError) return errorResult(error.message, { code: error.code });
    // The cause stays in the server log: driver and query text never reach the caller.
    console.error(`MCP tool ${name} failed:`, error);
    return errorResult(`${name} failed`, { code: TOOL_INTERNAL_ERROR });
  }
}
