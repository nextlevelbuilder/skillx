import { describe, expect, it } from "vitest";
import { loader } from "./well-known.openai-apps-challenge";

const call = (env: Record<string, unknown>) => loader({ context: { cloudflare: { env: env as unknown as Env } } });

describe("GET /.well-known/openai-apps-challenge", () => {
  it("returns exactly the configured token as plain text", async () => {
    const response = call({ OPENAI_APPS_CHALLENGE: "  tok_abc123\n" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("tok_abc123");
  });

  it("is a 404 when no token is configured", async () => {
    for (const env of [{}, { OPENAI_APPS_CHALLENGE: "   " }]) {
      const response = call(env);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("tok");
    }
  });
});
