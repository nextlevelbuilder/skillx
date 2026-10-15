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
import { MAX_MCP_BODY_BYTES } from "~/lib/mcp/request-body";

const CTX = { cloudflare: { env: {} } };

async function post(body: BodyInit, env: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const response = (await action({
    request: new Request("https://skillx.sh/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
      ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
    } as RequestInit),
    context: { cloudflare: { env } },
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

  it("lists the four read-only tools", async () => {
    const { response, json } = await post('{"jsonrpc":"2.0","id":2,"method":"tools/list"}');
    expect(response.status).toBe(200);
    expect(json.result.tools).toHaveLength(4);
    expect(json.result.tools.map((t: { name: string }) => t.name)).not.toContain("get_kit");
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
    expect(json.result.tools).toHaveLength(4);
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

  it("does not echo an unknown method name", async () => {
    const { text } = await post('{"jsonrpc":"2.0","id":5,"method":"<b>evil</b>"}');
    expect(text).not.toContain("evil");
  });
});

describe("POST /api/mcp — cost guards", () => {
  const tooLarge = `{"jsonrpc":"2.0","id":1,"method":"tools/list","pad":"${"x".repeat(MAX_MCP_BODY_BYTES)}"}`;

  it("refuses a body above the cap with 413 before parsing it", async () => {
    const { response, json } = await post(tooLarge);
    expect(response.status).toBe(413);
    expect(json.error.code).toBe(RPC.invalidRequest);
    expect(json.error.data.maxBytes).toBe(MAX_MCP_BODY_BYTES);
  });

  it("refuses on the declared Content-Length alone", async () => {
    const { response } = await post("{}", {}, { "Content-Length": String(MAX_MCP_BODY_BYTES + 1) });
    expect(response.status).toBe(413);
  });

  it("enforces the cap on the bytes read when no length is declared", async () => {
    const bytes = new TextEncoder().encode(tooLarge);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 4096) controller.enqueue(bytes.slice(i, i + 4096));
        controller.close();
      },
    });
    const { response } = await post(stream);
    expect(response.status).toBe(413);
  });

  it("accepts a body exactly at the cap", async () => {
    const base = '{"jsonrpc":"2.0","id":1,"method":"tools/list","pad":""}';
    const body = base.replace('"pad":""', `"pad":"${"x".repeat(MAX_MCP_BODY_BYTES - base.length)}"`);
    const { response } = await post(body);
    expect(response.status).toBe(200);
  });

  it("answers 429 with Retry-After when the limiter refuses, keyed under mcp:", async () => {
    const keys: string[] = [];
    const limiter = {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        return { success: false };
      },
    };
    const { response, json } = await post('{"jsonrpc":"2.0","id":1,"method":"tools/list"}', {
      RELEASE_READ_LIMITER: limiter,
    }, { "CF-Connecting-IP": "203.0.113.9" });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(json.error.code).toBe(RPC.rateLimited);
    expect(keys).toEqual(["mcp:ip:203.0.113.9"]);
  });

  it("lets the request through when the limiter allows it", async () => {
    const limiter = { limit: async () => ({ success: true }) };
    const { response } = await post('{"jsonrpc":"2.0","id":1,"method":"tools/list"}', {
      RELEASE_READ_LIMITER: limiter,
    });
    expect(response.status).toBe(200);
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
