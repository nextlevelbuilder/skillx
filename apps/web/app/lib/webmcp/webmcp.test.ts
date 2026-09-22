/**
 * WebMCP detection, registration, and read tools.
 *
 * WebMCP is a draft API, so the properties that matter are the fallbacks: an
 * absent or malformed `navigator.modelContext` must be inert, a registration
 * that throws must not be reported as successful, and nothing here may throw
 * into a page render.
 */

import { describe, expect, it, vi } from "vitest";
import {
  getModelContext,
  isWebMcpAvailable,
  registerWebMcpTools,
  type WebMcpTool,
} from "./model-context";
import { createReadTools } from "./read-tools";

function tool(name = "t"): WebMcpTool {
  return { name, description: "d", inputSchema: { type: "object" }, execute: async () => null };
}

describe("feature detection", () => {
  it("is inert when navigator is absent", () => {
    expect(getModelContext(undefined)).toBeNull();
    expect(isWebMcpAvailable(undefined)).toBe(false);
  });

  it("is inert when modelContext is missing", () => {
    expect(getModelContext({})).toBeNull();
  });

  it("is inert when modelContext is not an object", () => {
    expect(getModelContext({ modelContext: "yes" })).toBeNull();
    expect(getModelContext({ modelContext: null })).toBeNull();
  });

  it("is inert when modelContext has neither known method", () => {
    // A renamed or partial draft API must fall back, not throw later.
    expect(getModelContext({ modelContext: { tools: [] } })).toBeNull();
  });

  it("detects provideContext", () => {
    expect(isWebMcpAvailable({ modelContext: { provideContext: () => {} } })).toBe(true);
  });

  it("detects registerTool", () => {
    expect(isWebMcpAvailable({ modelContext: { registerTool: () => {} } })).toBe(true);
  });
});

describe("registration", () => {
  it("reports unavailable rather than throwing", () => {
    expect(registerWebMcpTools(undefined, [tool()])).toBe("unavailable");
  });

  it("registers all tools in one provideContext call when available", () => {
    const provideContext = vi.fn();
    const outcome = registerWebMcpTools({ modelContext: { provideContext } }, [tool("a"), tool("b")]);

    expect(outcome).toBe("registered");
    expect(provideContext).toHaveBeenCalledTimes(1);
    expect(provideContext.mock.calls[0][0].tools).toHaveLength(2);
  });

  it("falls back to registerTool per tool", () => {
    const registerTool = vi.fn();
    const outcome = registerWebMcpTools({ modelContext: { registerTool } }, [tool("a"), tool("b")]);

    expect(outcome).toBe("registered");
    expect(registerTool).toHaveBeenCalledTimes(2);
  });

  it("reports a throwing registration as failed, never as registered", () => {
    const provideContext = vi.fn(() => {
      throw new Error("rejected");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(registerWebMcpTools({ modelContext: { provideContext } }, [tool()])).toBe("failed");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not throw when the empty tool list is registered", () => {
    expect(registerWebMcpTools({ modelContext: { provideContext: () => {} } }, [])).toBe(
      "registered",
    );
  });
});

function fakeFetch(payload: unknown, capture: { url?: string; init?: RequestInit } = {}) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    capture.url = String(url);
    capture.init = init;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("read tools", () => {
  it("exposes the three read tools", () => {
    const tools = createReadTools({ fetchImpl: fakeFetch({}), baseUrl: "https://skillx.sh/" });
    expect(tools.map((t) => t.name)).toEqual(["search_skills", "get_skill", "check_skill_compatibility"]);
  });

  it("posts a search to the same endpoint the page uses", async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const tools = createReadTools({ fetchImpl: fakeFetch({ results: [] }, capture), baseUrl: "" });
    const search = tools.find((t) => t.name === "search_skills");

    await search?.execute({ query: "pdf", compatible: "agentkit" });

    expect(capture.url).toBe("/api/search");
    expect(capture.init?.method).toBe("POST");
    expect(JSON.parse(String(capture.init?.body))).toEqual({
      query: "pdf",
      compatible: "agentkit",
    });
  });

  it("omits optional search fields instead of sending nulls", async () => {
    const capture: { url?: string; init?: RequestInit } = {};
    const tools = createReadTools({ fetchImpl: fakeFetch({}, capture) });
    await tools.find((t) => t.name === "search_skills")?.execute({ query: "pdf" });

    expect(JSON.parse(String(capture.init?.body))).toEqual({ query: "pdf" });
  });

  it("encodes the slug and target when fetching one skill", async () => {
    const capture: { url?: string } = {};
    const tools = createReadTools({ fetchImpl: fakeFetch({}, capture) });
    await tools.find((t) => t.name === "get_skill")?.execute({ slug: "a/b", target: "agentkit@1.2.3" });

    expect(capture.url).toBe("/api/skills/a%2Fb?target=agentkit%401.2.3");
  });

  it("narrows the compatibility answer to the requested target", async () => {
    const payload = { compatibility: { declared: [], target: { status: "unknown" } } };
    const tools = createReadTools({ fetchImpl: fakeFetch(payload) });
    const result = (await tools
      .find((t) => t.name === "check_skill_compatibility")
      ?.execute({ slug: "find-skills", target: "agentkit" })) as Record<string, unknown>;

    expect(result.slug).toBe("find-skills");
    expect(result.compatibility).toEqual(payload.compatibility);
  });

  it("treats non-object arguments as no arguments rather than throwing", async () => {
    const capture: { url?: string } = {};
    const tools = createReadTools({ fetchImpl: fakeFetch({}, capture) });
    // Cast past the type: the point is runtime robustness against a caller that
    // sends something other than an object, which an in-page agent can do.
    await expect(
      tools.find((t) => t.name === "get_skill")?.execute("nope" as never),
    ).resolves.toBeDefined();
  });

  it("reports an unparseable response instead of returning a wrong shape", async () => {
    const textFetch = (async () =>
      new Response("<html>not json</html>", { status: 502 })) as unknown as typeof fetch;
    const tools = createReadTools({ fetchImpl: textFetch });
    const result = (await tools.find((t) => t.name === "get_skill")?.execute({ slug: "x" })) as Record<
      string,
      unknown
    >;

    expect(result.error).toContain("not valid JSON");
    expect(result.status).toBe(502);
  });
});
