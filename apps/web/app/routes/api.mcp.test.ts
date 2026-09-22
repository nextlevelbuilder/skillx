/**
 * Route-level tests for the remote MCP endpoint.
 *
 * This is the surface a client actually talks to, so the assertions are about
 * what goes on the wire: which HTTP status each case gets, whether a
 * notification is answered at all, and whether an unknown tool is a JSON-RPC
 * success carrying `isError` (it is) or a transport error (it is not).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth/authenticate-request", () => ({
  authenticateRequest: async () => null,
}));

import { action, loader } from "./api.mcp";
import { MCP_PROTOCOL_VERSION, RPC } from "~/lib/mcp/protocol";

const CTX = { cloudflare: { env: {} } };

async function post(body: string) {
  const response = (await action({
    request: new Request("https://skillx.sh/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
    context: CTX,
  } as never)) as Response;
  const text = await response.clone().text();
  return { response, text, json: text ? JSON.parse(text) : null };
}

describe("POST /api/mcp", () => {
  it("answers initialize with its protocol version and tool capability", async () => {
    const { response, json } = await post(
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
    );

    expect(response.status).toBe(200);
    expect(json.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(json.result.capabilities.tools).toEqual({ listChanged: false });
    expect(json.result.serverInfo.name).toBe("skillx");
  });

  it("tells the client that `unknown` compatibility is not support", async () => {
    const { json } = await post('{"jsonrpc":"2.0","id":1,"method":"initialize"}');
    expect(json.result.instructions).toContain("never read `unknown` as support");
  });

  it("lists the five tools", async () => {
    const { response, json } = await post('{"jsonrpc":"2.0","id":2,"method":"tools/list"}');
    expect(response.status).toBe(200);
    expect(json.result.tools).toHaveLength(5);
    expect(json.result.tools.map((t: { name: string }) => t.name)).toContain("check_compatibility");
  });

  it("returns an unknown tool as a JSON-RPC success with isError, not a transport error", async () => {
    const { response, json } = await post(
      '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nope","arguments":{}}}',
    );

    expect(response.status).toBe(200);
    expect(json.error).toBeUndefined();
    expect(json.result.isError).toBe(true);
  });

  it("rejects tools/call without a name as invalid params", async () => {
    const { json } = await post('{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{}}');
    expect(json.error.code).toBe(RPC.invalidParams);
  });

  it("answers a notification with 202 and no body, because notifications are not answered", async () => {
    const { response, text } = await post(
      '{"jsonrpc":"2.0","method":"notifications/initialized"}',
    );
    expect(response.status).toBe(202);
    expect(text).toBe("");
  });

  it("still answers a call whose id is 0", async () => {
    const { response, json } = await post('{"jsonrpc":"2.0","id":0,"method":"tools/list"}');
    expect(response.status).toBe(200);
    expect(json.id).toBe(0);
    expect(json.result.tools).toHaveLength(5);
  });

  it("reports malformed JSON as a parse error with a 400", async () => {
    const { response, json } = await post("{not json");
    expect(response.status).toBe(400);
    expect(json.error.code).toBe(RPC.parseError);
  });

  it("names the supported methods when one is unknown", async () => {
    const { response, json } = await post('{"jsonrpc":"2.0","id":5,"method":"resources/list"}');
    expect(response.status).toBe(404);
    expect(json.error.code).toBe(RPC.methodNotFound);
    expect(json.error.data.supportedMethods).toContain("tools/call");
  });
});

describe("GET /api/mcp", () => {
  it("refuses GET with the reason instead of holding a stream open", async () => {
    const response = (await loader({
      request: new Request("https://skillx.sh/api/mcp"),
      context: CTX,
    } as never)) as Response;

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("POST-only");
  });
});
