/**
 * Cookie-authenticated skill mutations (favorite, vote, rate, review, and register
 * when it falls back to the session) must come from this site's origin:
 * `SameSite=Lax` alone still lets a sibling subdomain send the session cookie. A
 * foreign `Origin` (or a cross-site `Sec-Fetch-Site`) is refused before anything is
 * written (and, on the session-only routes, before the session is read); same-origin
 * and header-less requests pass, and an API-key request is not subject to the check.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    selectQueue: [] as unknown[],
    sessionReads: 0,
    writes: 0,
    authMethod: "session" as "session" | "api-key",
    imports: 0,
  };

  function chain(result: unknown) {
    const promise = Promise.resolve(result);
    const c: Record<string, unknown> = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      values: () => c,
      set: () => c,
      returning: () => c,
      onConflictDoUpdate: () => c,
      get: () => promise,
      then: (a: never, b: never) => promise.then(a, b),
    };
    return c;
  }
  const write = (result: unknown) => {
    state.writes++;
    return chain(result);
  };
  return { state, chain, write };
});

vi.mock("~/lib/db", () => ({
  getDb: () => ({
    select: () => h.chain(h.state.selectQueue.shift() ?? []),
    insert: () => h.write([{ id: "row_1" }]),
    update: () => h.write(undefined),
    delete: () => h.write(undefined),
    run: async () => {
      h.state.writes++;
    },
  }),
}));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => {
    h.state.sessionReads++;
    return { user: { id: "u1" } };
  },
}));
vi.mock("~/lib/auth/authenticate-request", () => ({
  authenticateRequest: async () => ({ userId: "u1", method: h.state.authMethod }),
}));
vi.mock("~/lib/github/validate-repo-ownership", () => ({ validateRepoOwnership: async () => ({ valid: true }) }));
vi.mock("~/lib/github/skill-import", () => ({
  runImport: async () => {
    h.state.imports++;
    return Response.json({ imported: 1 });
  },
  handleRegisterError: () => Response.json({ error: "failed" }, { status: 500 }),
}));
vi.mock("~/lib/leaderboard/recompute-skill-scores", () => ({ recomputeSkillScores: async () => {} }));
vi.mock("~/lib/db/skill-aliases", () => ({
  resolveSkillBySlug: async () => ({ id: "skill_1", slug: "s" }),
}));

import { action as favorite } from "./api.skill-favorite";
import { action as vote } from "./api.skill-vote";
import { action as rate } from "./api.skill-rate";
import { action as review } from "./api.skill-review";
import { action as register } from "./api.skill-register";

type Action = (args: never) => Promise<unknown>;

const routes: Array<{ name: string; action: Action; body?: unknown; selects: unknown[] }> = [
  { name: "favorite", action: favorite as Action, selects: [[]] },
  { name: "vote", action: vote as Action, body: { type: "up" }, selects: [[{ count: 0 }], [], [{ net_votes: 1 }]] },
  { name: "rate", action: rate as Action, body: { score: 8 }, selects: [{ avgRating: 8, ratingCount: 1 }] },
  { name: "review", action: review as Action, body: { content: "Great" }, selects: [] },
];

const context = { cloudflare: { env: { DB: {} } } } as never;

async function send(route: (typeof routes)[number], headers: Record<string, string>) {
  h.state.selectQueue = [...route.selects];
  const request = new Request(`https://skillx.test/api/skills/s/${route.name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: route.body === undefined ? undefined : JSON.stringify(route.body),
  });
  const res = (await route.action({ request, params: { slug: "s" }, context } as never)) as Response;
  return res.status;
}

beforeEach(() => {
  h.state.sessionReads = 0;
  h.state.writes = 0;
  h.state.imports = 0;
  h.state.authMethod = "session";
});

describe.each(routes)("POST /api/skills/:slug/$name", (route) => {
  it("refuses a foreign or sibling-subdomain Origin before reading the session or writing", async () => {
    for (const origin of ["https://evil.example", "https://sub.skillx.test", "http://skillx.test"]) {
      expect(await send(route, { Origin: origin })).toBe(403);
    }
    expect(await send(route, { "Sec-Fetch-Site": "same-site" })).toBe(403);
    expect(await send(route, { "Sec-Fetch-Site": "cross-site" })).toBe(403);
    expect(h.state.sessionReads).toBe(0);
    expect(h.state.writes).toBe(0);
  });

  it("accepts a same-origin browser request and a header-less non-browser client", async () => {
    expect(await send(route, { Origin: "https://skillx.test" })).toBe(200);
    expect(await send(route, { "Sec-Fetch-Site": "same-origin" })).toBe(200);
    expect(await send(route, { "Sec-Fetch-Site": "none" })).toBe(200);
    expect(await send(route, {})).toBe(200);
    expect(h.state.writes).toBeGreaterThan(0);
  });
});

describe("POST /api/skills/register", () => {
  async function registerWith(headers: Record<string, string>) {
    const request = new Request("https://skillx.test/api/skills/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ owner: "org", repo: "repo" }),
    });
    return ((await register({ request, params: {}, context } as never)) as Response).status;
  }

  it("refuses a cookie-authenticated request from a foreign Origin before importing", async () => {
    expect(await registerWith({ Origin: "https://evil.example" })).toBe(403);
    expect(await registerWith({ "Sec-Fetch-Site": "cross-site" })).toBe(403);
    expect(h.state.imports).toBe(0);
  });

  it("accepts a same-origin or header-less session request", async () => {
    expect(await registerWith({ Origin: "https://skillx.test" })).toBe(200);
    expect(await registerWith({})).toBe(200);
    expect(h.state.imports).toBe(2);
  });

  it("does not apply the check to an API-key request", async () => {
    h.state.authMethod = "api-key";
    expect(await registerWith({ Origin: "https://evil.example" })).toBe(200);
    expect(h.state.imports).toBe(1);
  });
});
