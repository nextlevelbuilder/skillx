/**
 * Route-level tests for the remote MCP endpoint.
 *
 * This is the surface a client actually talks to, so the assertions are about
 * what goes on the wire: which HTTP status each case gets, whether a
 * notification is answered at all, and whether an unknown tool is a JSON-RPC
 * success carrying `isError` (it is) or a transport error (it is not).
 */

import { describe, expect, it, vi } from "vitest";

const authSpy = vi.hoisted(() => vi.fn(async () => ({ userId: "user-with-session" })));
vi.mock("~/lib/auth/authenticate-request", () => ({ authenticateRequest: authSpy }));
const keySpy = vi.hoisted(() => vi.fn(async (_db: unknown, key: string) => (key === "sx_good" ? { userId: "user-with-key" } : null)));
vi.mock("~/lib/auth/authenticate-api-key", () => ({ authenticateApiKey: keySpy }));
vi.mock("~/lib/db", () => ({ getDb: () => ({}) }));

const callToolSpy = vi.hoisted(() => ({ ctx: [] as Array<{ userId?: string | null }> }));
vi.mock("~/lib/mcp/tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/mcp/tools")>();
  return {
    ...actual,
    callTool: (async (name, args, ctx) => {
      callToolSpy.ctx.push(ctx);
      return actual.callTool(name, args, ctx);
    }) as typeof actual.callTool,
  };
});
import { action, loader } from "./api.mcp";
import { MCP_PROTOCOL_VERSION, RPC } from "~/lib/mcp/protocol";
import { MAX_MCP_BODY_BYTES } from "~/lib/mcp/request-body";

const CTX = { cloudflare: { env: {} } };
const KITS_ON = { SKILLX_PERSONAL_KITS_API: "1" };
const GET_KIT = JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "get_kit", arguments: { kit: "@a/k" } } });

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

  it("lists the five read-only tools", async () => {
    const { response, json } = await post('{"jsonrpc":"2.0","id":2,"method":"tools/list"}');
    expect(response.status).toBe(200);
    expect(json.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "check_compatibility",
      "get_kit",
      "get_package",
      "get_release",
      "search_packages",
    ]);
  });

  it("marks every tool read-only, non-destructive and idempotent", async () => {
    const { json } = await post('{"jsonrpc":"2.0","id":2,"method":"tools/list"}');
    for (const tool of json.result.tools) {
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });

  it("answers ping with an empty result", async () => {
    const { response, json } = await post('{"jsonrpc":"2.0","id":7,"method":"ping"}');
    expect(response.status).toBe(200);
    expect(json).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
  });

  it("resolves the caller for get_kit only, from the session or an unscoped key", async () => {
    callToolSpy.ctx.length = 0;
    await post(GET_KIT, KITS_ON, { Cookie: "session=abc" });
    await post(GET_KIT, KITS_ON, { Authorization: "Bearer sx_good" });
    expect(callToolSpy.ctx.map((ctx) => ctx.userId)).toEqual(["user-with-session", "user-with-key"]);
  });

  it("reports a rejected API key on get_kit as a tool error, never as anonymous", async () => {
    callToolSpy.ctx.length = 0;
    const { response, json } = await post(GET_KIT, KITS_ON, { Authorization: "Bearer sx_bad" });
    expect(response.status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(JSON.parse(json.result.content[0].text).details.code).toBe("invalid_api_key");
    expect(callToolSpy.ctx).toHaveLength(0);
  });

  it("answers get_kit with feature_disabled while personal kits are off, without reading credentials", async () => {
    keySpy.mockClear();
    const { json } = await post(GET_KIT, {}, { Authorization: "Bearer sx_bad" });
    expect(json.result.isError).toBe(true);
    expect(JSON.parse(json.result.content[0].text).details.code).toBe("feature_disabled");
    expect(keySpy).not.toHaveBeenCalled();
  });

  it("reports an unexpected viewer failure on get_kit as internal_error, without the cause", async () => {
    keySpy.mockImplementationOnce(async () => {
      throw new Error("D1 exploded: secret detail");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { response, json } = await post(GET_KIT, KITS_ON, { Authorization: "Bearer sx_good" });
    error.mockRestore();
    expect(response.status).toBe(200);
    expect(json.result.isError).toBe(true);
    expect(JSON.parse(json.result.content[0].text)).toEqual({ error: "get_kit failed", details: { code: "internal_error" } });
  });

  it("returns an unknown tool as a JSON-RPC success with isError, not a transport error", async () => {
    const { response, json } = await post(
      '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nope","arguments":{}}}',
    );

    expect(response.status).toBe(200);
    expect(json.error).toBeUndefined();
    expect(json.result.isError).toBe(true);
  });

  it("runs every tool but get_kit as the anonymous viewer and never reads the request's credentials", async () => {
    authSpy.mockClear();
    keySpy.mockClear();
    callToolSpy.ctx.length = 0;
    for (const name of ["search_packages", "get_package", "check_compatibility", "get_release"]) {
      await post(
        JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: {} } }),
        {},
        { Authorization: "Bearer sx_live_example", Cookie: "session=abc" },
      );
    }
    expect(authSpy).not.toHaveBeenCalled();
    expect(keySpy).not.toHaveBeenCalled();
    expect(callToolSpy.ctx).toHaveLength(4);
    expect(callToolSpy.ctx.every((ctx) => ctx.userId === null)).toBe(true);
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
