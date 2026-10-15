/**
 * WebMCP read tools.
 *
 * Each tool calls the same public HTTP endpoint the page itself uses — the
 * search API and the detail API — rather than importing server executors or
 * re-deriving answers. One implementation means an in-page agent cannot get a
 * different answer from the API, and the protected payload boundary stays in
 * exactly one place: the server.
 *
 * `fetchImpl` is injected so the tools are testable without a live network and
 * so the caller controls credentials and origin.
 */

import type { WebMcpTool } from "./model-context";

const STRING = { type: "string" } as const;

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: "Response was not valid JSON", status: response.status };
  }
}

function asRecord(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
}

export interface ReadToolOptions {
  fetchImpl: typeof fetch;
  /** Trailing slashes are tolerated; the base is normalized. */
  baseUrl?: string;
}

export function createReadTools(options: ReadToolOptions): WebMcpTool[] {
  const { fetchImpl } = options;
  const base = (options.baseUrl ?? "").replace(/\/+$/, "");

  return [
    {
      name: "search_skills",
      description:
        "Search the SkillX catalog. Pass `compatible` with a runtime name to keep only listings " +
        "that declare it; the response reports how many listings were undecided and therefore " +
        "excluded, so an empty result is explained. `compatible` takes a runtime, not a version.",
      inputSchema: {
        type: "object",
        properties: { query: STRING, category: STRING, compatible: STRING },
        required: ["query"],
        additionalProperties: false,
      },
      execute: async (rawArgs) => {
        const args = asRecord(rawArgs);
        const response = await fetchImpl(`${base}/api/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: args.query,
            ...(args.category ? { category: args.category } : {}),
            ...(args.compatible ? { compatible: args.compatible } : {}),
          }),
        });
        return readJson(response);
      },
    },
    {
      name: "get_skill",
      description:
        "Fetch one skill by slug: metadata, references, scripts, and its declared compatibility. " +
        "The SKILL.md body is present only when the caller is allowed to read it; a protected " +
        "listing answers without its body rather than with an empty one.",
      inputSchema: {
        type: "object",
        properties: { slug: STRING, target: STRING },
        required: ["slug"],
        additionalProperties: false,
      },
      execute: async (rawArgs) => {
        const args = asRecord(rawArgs);
        const slug = encodeURIComponent(String(args.slug ?? ""));
        const target = args.target ? `?target=${encodeURIComponent(String(args.target))}` : "";
        const response = await fetchImpl(`${base}/api/skills/${slug}${target}`);
        return readJson(response);
      },
    },
    {
      name: "check_skill_compatibility",
      description:
        "Ask whether one skill supports a `runtime` or `runtime@version`. Only `declared` and " +
        "`verified` mean support; `unknown` means no claim was made and must not be read as " +
        "compatibility.",
      inputSchema: {
        type: "object",
        properties: { slug: STRING, target: STRING },
        required: ["slug", "target"],
        additionalProperties: false,
      },
      execute: async (rawArgs) => {
        const args = asRecord(rawArgs);
        const slug = encodeURIComponent(String(args.slug ?? ""));
        const target = encodeURIComponent(String(args.target ?? ""));
        const response = await fetchImpl(`${base}/api/skills/${slug}?target=${target}`);
        const body = await readJson(response);
        const record = asRecord(body);
        return { slug: args.slug, target: args.target, compatibility: record.compatibility ?? null };
      },
    },
  ];
}
