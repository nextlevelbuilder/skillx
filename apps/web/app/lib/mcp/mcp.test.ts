/**
 * MCP protocol vocabulary and tool dispatch.
 *
 * The edge cases here are the ones that silently break a client: a request with
 * `id: 0` is a call and must be answered (it is not a notification), a
 * notification must never be answered, and a malformed body must become a
 * JSON-RPC error rather than an exception.
 */

import { describe, expect, it } from "vitest";
import {
  MCP_PROTOCOL_VERSION,
  RPC,
  errorResult,
  isNotification,
  parseRequest,
  rpcError,
  rpcResult,
  textResult,
  type JsonRpcRequest,
} from "./protocol";
import { TOOL_DEFINITIONS, TOOL_NAMES, callTool, isToolName } from "./tools";
import type { ToolContext } from "./handlers";

const CTX = { env: {} as never, userId: null } satisfies ToolContext;

function parseText(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("parseRequest", () => {
  it("accepts a well-formed call", () => {
    const parsed = parseRequest('{"jsonrpc":"2.0","id":1,"method":"tools/list"}');
    expect("request" in parsed).toBe(true);
    expect(("request" in parsed ? parsed.request.method : null)).toBe("tools/list");
  });

  it("reports malformed JSON as a parse error, not an exception", () => {
    const parsed = parseRequest("{not json");
    expect("failure" in parsed).toBe(true);
    if ("failure" in parsed) {
      expect(parsed.failure.error.code).toBe(RPC.parseError);
      expect(parsed.failure.id).toBeNull();
    }
  });

  it("rejects a batch array, which this server does not support", () => {
    const parsed = parseRequest("[1,2]");
    expect("failure" in parsed && parsed.failure.error.code).toBe(RPC.invalidRequest);
  });

  it("rejects a request with no method and echoes its id", () => {
    const parsed = parseRequest('{"jsonrpc":"2.0","id":7}');
    expect("failure" in parsed && parsed.failure.id).toBe(7);
  });
});

describe("isNotification", () => {
  it("treats a missing id as a notification", () => {
    expect(isNotification({ method: "notifications/initialized" } as JsonRpcRequest)).toBe(true);
  });

  it("treats id 0 as a call, not a notification", () => {
    // `0` is falsy, so a truthiness check here would swallow a real call.
    expect(isNotification({ id: 0, method: "tools/list" } as JsonRpcRequest)).toBe(false);
  });

  it("treats a null id as a notification, per the JSON-RPC note on null", () => {
    expect(isNotification({ id: null, method: "x" } as JsonRpcRequest)).toBe(true);
  });
});

describe("envelope builders", () => {
  it("builds a result envelope", () => {
    expect(rpcResult(1, { ok: true })).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
  });

  it("omits `data` when none was supplied", () => {
    expect(rpcError(1, RPC.invalidParams, "bad")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: RPC.invalidParams, message: "bad" },
    });
  });

  it("carries text content for a tool result", () => {
    const result = textResult({ a: 1 });
    expect(result.content[0].type).toBe("text");
    expect(result.isError).toBeUndefined();
  });

  it("marks a tool error as a result, not a transport error", () => {
    const result = errorResult("nope", { why: "test" });
    expect(result.isError).toBe(true);
    expect(parseText(result)).toEqual({ error: "nope", details: { why: "test" } });
  });

  it("declares a protocol version", () => {
    expect(MCP_PROTOCOL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("tool catalog", () => {
  it("exposes exactly the five tools the issue names", () => {
    expect([...TOOL_NAMES].sort()).toEqual([
      "check_compatibility",
      "get_kit",
      "get_package",
      "get_release",
      "search_packages",
    ]);
  });

  it("gives every tool a description and a JSON schema it can be called with", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(Object.keys(tool.inputSchema.properties).length, tool.name).toBeGreaterThan(0);
    }
  });

  it("has a handler for every tool it advertises", () => {
    // A definition without a handler would be advertised and then refuse to run.
    for (const name of TOOL_NAMES) expect(isToolName(name), name).toBe(true);
  });

  it("tells the agent that `unknown` is not support", () => {
    const check = TOOL_DEFINITIONS.find((t) => t.name === "check_compatibility");
    expect(check?.description).toContain("`unknown`");
    expect(check?.description).toContain("must not be read as compatibility");
  });
});

describe("callTool", () => {
  it("refuses an unknown tool and lists what exists", async () => {
    const result = await callTool("does_not_exist", {}, CTX);
    expect(result.isError).toBe(true);
    // `errorResult` nests extra data under `details`, so the payload is uniform.
    expect((parseText(result).details as { availableTools: string[] }).availableTools).toEqual(
      TOOL_NAMES,
    );
  });

  it("rejects a missing required argument instead of querying", async () => {
    const result = await callTool("search_packages", {}, CTX);
    expect(result.isError).toBe(true);
    expect(String(parseText(result).error)).toContain("query");
  });

  it("rejects a whitespace-only required argument", async () => {
    const result = await callTool("search_packages", { query: "   " }, CTX);
    expect(result.isError).toBe(true);
  });

  it("rejects a missing slug for the detail tools", async () => {
    for (const name of ["get_package", "check_compatibility", "get_kit"]) {
      const result = await callTool(name, {}, CTX);
      expect(result.isError, name).toBe(true);
      expect(String(parseText(result).error), name).toContain("slug");
    }
  });

  it("requires a package name for get_release", async () => {
    const result = await callTool("get_release", {}, CTX);
    expect(result.isError).toBe(true);
    expect(String(parseText(result).error)).toContain("package");
  });

  it("rejects a missing target for check_compatibility", async () => {
    const result = await callTool("check_compatibility", { slug: "find-skills" }, CTX);
    expect(result.isError).toBe(true);
    expect(String(parseText(result).error)).toContain("target");
  });

  it("treats non-object arguments as no arguments rather than throwing", async () => {
    const result = await callTool("get_package", "not-an-object", CTX);
    expect(result.isError).toBe(true);
    expect(String(parseText(result).error)).toContain("slug");
  });

  it("converts a handler failure into a tool error instead of rejecting", async () => {
    // `{}` has no DB binding, so the handler throws inside the storage layer.
    // The call must still resolve, with isError, so the agent sees why.
    const result = await callTool("get_package", { slug: "find-skills" }, CTX);
    expect(result.isError).toBe(true);
    expect(String(parseText(result).error)).toContain("get_package");
  });
});
