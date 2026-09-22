/**
 * Route-level tests for the search API.
 *
 * The executor and the compatibility filter have their own unit tests; what is
 * untested without this file is the route itself — argument validation, the limit
 * clamp, and the response envelope that the CLI, the search page, and the WebMCP
 * tools all consume. Those are contract details, and a contract detail is exactly
 * what silently drifts.
 *
 * `executeSearch` is replaced so the assertions are about what the route forwards
 * and what it returns, not about ranking quality.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    calls: [] as Array<Record<string, unknown>>,
    outcome: { results: [] } as Record<string, unknown>,
    shouldThrow: false,
    userId: undefined as string | undefined,
  };
  return { state };
});

vi.mock("~/lib/search/search-executor", () => ({
  executeSearch: async (_env: unknown, params: Record<string, unknown>) => {
    h.state.calls.push(params);
    if (h.state.shouldThrow) throw new Error("vectorize down");
    return h.state.outcome;
  },
}));

vi.mock("~/lib/auth/authenticate-request", () => ({
  authenticateRequest: async () => (h.state.userId ? { userId: h.state.userId } : null),
}));

import { action, loader } from "./api.search";

const ENV = { DB: {}, KV: {}, AI: {}, VECTORIZE: {}, ENVIRONMENT: "test" };

function lastCall(): Record<string, unknown> {
  return h.state.calls[h.state.calls.length - 1];
}

async function post(body: unknown) {
  const response = (await action({
    request: new Request("https://skillx.sh/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    context: { cloudflare: { env: ENV } },
  } as never)) as Response;
  return { response, json: (await response.clone().json()) as Record<string, unknown> };
}

async function get(queryString: string) {
  const response = (await loader({
    request: new Request(`https://skillx.sh/api/search${queryString}`),
    context: { cloudflare: { env: ENV } },
  } as never)) as Response;
  return { response, json: (await response.clone().json()) as Record<string, unknown> };
}

beforeEach(() => {
  h.state.calls = [];
  h.state.outcome = { results: [] };
  h.state.shouldThrow = false;
  h.state.userId = undefined;
});

describe("POST /api/search — validation", () => {
  it("rejects a missing query with 400", async () => {
    const { response, json } = await post({});
    expect(response.status).toBe(400);
    expect(json.error).toContain("required");
    expect(h.state.calls).toHaveLength(0);
  });

  it("rejects a non-string query with 400", async () => {
    const { response } = await post({ query: 42 });
    expect(response.status).toBe(400);
  });

  it("rejects a non-string `compatible` instead of coercing it", async () => {
    const { response, json } = await post({ query: "pdf", compatible: ["agentkit"] });
    expect(response.status).toBe(400);
    expect(json.error).toContain("compatible");
  });
});

describe("POST /api/search — what it forwards", () => {
  it("forwards the query, the authenticated user, and the default limit", async () => {
    h.state.userId = "user_1";
    await post({ query: "pdf" });

    expect(lastCall().query).toBe("pdf");
    expect(lastCall().userId).toBe("user_1");
    expect(lastCall().limit).toBe(20);
  });

  it("clamps a too-large limit instead of honouring it", async () => {
    await post({ query: "pdf", limit: 5000 });
    expect(lastCall().limit).toBe(100);
  });

  it("falls back to the default for zero, negative, and non-numeric limits", async () => {
    for (const limit of [0, -10, "abc"]) {
      h.state.calls = [];
      await post({ query: "pdf", limit });
      expect(lastCall().limit, String(limit)).toBe(20);
    }
  });

  it("forwards the category and paid filters", async () => {
    await post({ query: "pdf", category: "documents", is_paid: true });
    expect(lastCall().filters).toEqual({ category: "documents", is_paid: true });
  });

  it("omits the compatibility filter when none was requested", async () => {
    await post({ query: "pdf" });
    expect(lastCall()).not.toHaveProperty("compatible");
  });

  it("parses a runtime filter and drops the version suffix", async () => {
    // `--compatible` is runtime-only; version-aware answers live on the detail
    // surface, so the version must not reach the search filter.
    await post({ query: "pdf", compatible: "agentkit@1.2.3" });
    expect(lastCall().compatible).toEqual({ runtime: "agentkit" });
  });
});

describe("POST /api/search — response envelope", () => {
  it("returns results and their count", async () => {
    h.state.outcome = { results: [{ slug: "a" }, { slug: "b" }] };
    const { response, json } = await post({ query: "pdf" });

    expect(response.status).toBe(200);
    expect(json.count).toBe(2);
    expect(json.results).toHaveLength(2);
  });

  it("carries the compatibility report only when a filter ran", async () => {
    h.state.outcome = { results: [], compatibilityFilter: { evaluated: 40, matched: 0 } };
    const { json } = await post({ query: "pdf", compatible: "agentkit" });
    expect(json.compatibilityFilter).toBeDefined();
  });

  it("does not invent a compatibility report for an unfiltered search", async () => {
    h.state.outcome = { results: [] };
    const { json } = await post({ query: "pdf" });

    expect(json).not.toHaveProperty("compatibilityFilter");
    expect(json).not.toHaveProperty("note");
  });

  it("carries the empty-result note so an agent knows why nothing came back", async () => {
    h.state.outcome = { results: [], note: "no listing declares agentkit" };
    const { json } = await post({ query: "pdf", compatible: "agentkit" });
    expect(json.note).toBe("no listing declares agentkit");
  });

  it("reports a search failure as a 500 envelope rather than an empty success", async () => {
    h.state.shouldThrow = true;
    const { response, json } = await post({ query: "pdf" });

    expect(response.status).toBe(500);
    expect(json.error).toBe("Search failed");
    expect(json.details).toBe("vectorize down");
  });
});

describe("GET /api/search — the web UI path", () => {
  it("returns an empty result set when no query is given, without searching", async () => {
    const { response, json } = await get("");

    expect(response.status).toBe(200);
    expect(json).toEqual({ results: [], count: 0 });
    expect(h.state.calls).toHaveLength(0);
  });

  it("searches when ?q= is present", async () => {
    await get("?q=pdf");
    expect(lastCall().query).toBe("pdf");
  });

  it("reads is_paid as a boolean and leaves it undefined when absent", async () => {
    await get("?q=pdf&is_paid=true&category=documents");
    expect(lastCall().filters).toEqual({ category: "documents", is_paid: true });

    h.state.calls = [];
    await get("?q=pdf");
    expect(lastCall().filters).toEqual({ category: undefined, is_paid: undefined });
  });

  it("treats a missing limit as the default rather than NaN", async () => {
    await get("?q=pdf");
    expect(lastCall().limit).toBe(20);
  });

  it("parses ?compatible= the same way POST does", async () => {
    await get("?q=pdf&compatible=agentkit");
    expect(lastCall().compatible).toEqual({ runtime: "agentkit" });
  });
});
