/**
 * Response headers on `llms.txt` and `llms-full.txt`.
 *
 * Both documents are plain text an agent may fetch from a browser context, so
 * they must not be content-sniffed into something executable, on success or on
 * failure.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fail: false }));

vi.mock("~/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("~/lib/cache/kv-cache", () => ({
  getCached: async (_kv: unknown, _key: string, _ttl: number, fetcher: () => Promise<string>) => fetcher(),
}));
vi.mock("~/lib/catalog/public-catalog-index", () => ({
  fetchPublicCatalogIndex: async () => {
    if (state.fail) throw new Error("boom");
    return { entries: [], truncated: false };
  },
}));

import { loader as llmsTxt } from "./llms-txt";
import { loader as llmsFullTxt } from "./llms-full-txt";

async function call(loader: typeof llmsTxt, path: string) {
  return (await loader({
    request: new Request(`https://skillx.sh${path}`),
    context: { cloudflare: { env: {} } },
  } as never)) as Response;
}

beforeEach(() => {
  state.fail = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each([
  ["/llms.txt", llmsTxt],
  ["/llms-full.txt", llmsFullTxt],
])("%s", (path, loader) => {
  it("is served as non-sniffable plain text", async () => {
    const response = await call(loader, path);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("keeps nosniff on the error response", async () => {
    state.fail = true;
    const response = await call(loader, path);
    expect(response.status).toBe(500);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
