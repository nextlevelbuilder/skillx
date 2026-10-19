/**
 * The in-page `get_package` and `get_release` must be the remote MCP tools,
 * not look-alikes: same names, same schemas and descriptions, and the answer
 * of the real `/api/mcp` route for the same arguments.
 */

import { describe, expect, it } from "vitest";
import { createMcpMirrorTools, MIRRORED_TOOL_NAMES } from "./mcp-mirror-tools";
import { TOOL_DEFINITIONS, callTool } from "~/lib/mcp/tools";
import { action } from "~/routes/api.mcp";

/** A fetch that answers through the real MCP route, as the same origin would. */
function routeFetch(env: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), "https://skillx.sh"), init);
    calls.push({ url: request.url, body: JSON.parse(String(init?.body)) });
    return (await action({ request, context: { cloudflare: { env } } } as never)) as Response;
  }) as typeof fetch;
  return { impl, calls };
}

const fixedFetch = (body: string, status = 200) =>
  (async () => new Response(body, { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

describe("WebMCP mirror of remote MCP tools", () => {
  it("advertises the remote tools' names, schemas and descriptions unchanged", () => {
    const local = createMcpMirrorTools({ fetchImpl: fixedFetch("{}") });
    for (const name of MIRRORED_TOOL_NAMES) {
      const remote = TOOL_DEFINITIONS.find((t) => t.name === name)!;
      const mirror = local.find((t) => t.name === name)!;
      expect(mirror.inputSchema).toEqual(remote.inputSchema);
      expect(mirror.description).toBe(remote.description);
    }
  });

  it("returns exactly what the remote get_release answers", async () => {
    const { impl, calls } = routeFetch();
    const [, getRelease] = createMcpMirrorTools({ fetchImpl: impl, baseUrl: "https://skillx.sh/" });
    const args = { package: "@alpha/skill", version: "1.0.0" };

    const viaPage = await getRelease.execute(args);
    const remote = await callTool("get_release", args, { env: {} as never, userId: null });

    expect(calls[0].url).toBe("https://skillx.sh/api/mcp");
    expect(calls[0].body).toMatchObject({ method: "tools/call", params: { name: "get_release", arguments: args } });
    expect(viaPage).toEqual(JSON.parse(remote.content[0].text));
    expect(viaPage).toMatchObject({ found: false, code: "not_found" });
  });

  it("keeps a tool error distinguishable from an answer", async () => {
    const { impl } = routeFetch();
    const [getPackage] = createMcpMirrorTools({ fetchImpl: impl });
    expect(await getPackage.execute({})).toMatchObject({ isError: true, details: { code: "invalid_arguments" } });
  });

  it("reports a JSON-RPC error and an unreadable body instead of a wrong shape", async () => {
    const rpcError = JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32029, message: "Too many requests" } });
    const [, fromRpc] = createMcpMirrorTools({ fetchImpl: fixedFetch(rpcError, 429) });
    expect(await fromRpc.execute({ package: "@a/b" })).toEqual({ isError: true, error: "Too many requests", rpcCode: -32029, status: 429 });

    const [, fromHtml] = createMcpMirrorTools({ fetchImpl: fixedFetch("<html>", 502) });
    expect(await fromHtml.execute({ package: "@a/b" })).toMatchObject({ isError: true, status: 502 });
  });
});
