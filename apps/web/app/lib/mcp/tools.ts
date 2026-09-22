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
import { ToolInputError, asRecord, errorResult, textResult, type ToolResult } from "./protocol";

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
      "Read immutable release records for a package from the registry, newest first, optionally " +
      "pinned to one `version`. Returns `found: false` with a reason code (`no_package`, " +
      "`no_releases`, `unknown_version`) when nothing is recorded — the registry is settled in a " +
      "later phase, so `no_package` is the expected answer for most of today's catalog.",
    inputSchema: {
      type: "object",
      properties: { package: STRING, version: STRING },
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
      "Fetch a published kit (a collection revision) by slug, including its members and config. " +
      "Only public kits are readable; a private or unknown slug returns `not_found` so the tool " +
      "cannot be used to discover private slugs.",
    inputSchema: {
      type: "object",
      properties: { slug: STRING },
      required: ["slug"],
      additionalProperties: false,
    },
  },
];

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
    return errorResult(`Unknown tool: ${name}`, { availableTools: TOOL_NAMES });
  }

  try {
    return textResult(await HANDLERS[name](asRecord(rawArgs), ctx));
  } catch (error) {
    if (error instanceof ToolInputError) return errorResult(error.message);
    console.error(`MCP tool ${name} failed:`, error);
    return errorResult(
      `${name} failed`,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
