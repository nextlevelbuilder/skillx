/**
 * Every route that takes a client-supplied slug must resolve it through the alias
 * table, so a slug a skill used to have keeps working instead of returning 404 or an
 * empty overlay. The resolver is stubbed to know only `old-slug` → `skill_1`; the
 * routes therefore only succeed when they go through it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = { selectQueue: [] as unknown[], session: { user: { id: "u1" } } as unknown };

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
  return { state, chain };
});

vi.mock("~/lib/db", () => ({
  getDb: () => ({
    select: () => h.chain(h.state.selectQueue.shift() ?? []),
    insert: () => h.chain([{ id: "row_1" }]),
    update: () => h.chain(undefined),
    delete: () => h.chain(undefined),
    run: async () => undefined,
  }),
}));
vi.mock("~/lib/auth/session-helpers", () => ({ getSession: async () => h.state.session }));
vi.mock("~/lib/auth/authenticate-api-key", () => ({
  authenticateApiKey: async () => ({ userId: "u1" }),
}));
vi.mock("~/lib/leaderboard/recompute-skill-scores", () => ({ recomputeSkillScores: async () => {} }));
vi.mock("~/lib/db/skill-aliases", () => ({
  resolveSkillBySlug: async (_db: unknown, slug: string) =>
    slug === "old-slug" || slug === "new-slug" ? { id: "skill_1", slug: "new-slug" } : null,
  resolveSkillIdsBySlugs: async (_db: unknown, slugs: string[]) =>
    new Map(slugs.filter((s) => s === "old-slug" || s === "new-slug").map((s) => [s, "skill_1"])),
}));

import { loader as interactions } from "./api.user-interactions";
import { loader as reviewLoader, action as reviewAction } from "./api.skill-review";
import { action as rate } from "./api.skill-rate";
import { action as vote } from "./api.skill-vote";
import { action as usage } from "./api.usage-report";

const context = { cloudflare: { env: { DB: {} } } } as never;
const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  h.state.selectQueue = [];
});

describe("alias slugs resolve on every slug-taking route", () => {
  it("user-interactions overlays favorites and votes under the requested alias slug", async () => {
    h.state.selectQueue = [[{ skill_id: "skill_1" }], [{ skill_id: "skill_1", vote_type: "up" }]];
    const request = new Request("http://x/api/user/interactions?slugs=old-slug,missing");
    const res = await interactions({ request, context, params: {} } as never);
    expect(await res.json()).toEqual({ favorites: ["old-slug"], votes: { "old-slug": "up" } });
  });

  it("review loader returns reviews for an old slug", async () => {
    h.state.selectQueue = [[{ id: "r1" }]];
    const res = await reviewLoader({
      request: new Request("http://x"), context, params: { slug: "old-slug" },
    } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reviews: [{ id: "r1" }] });
  });

  it("review action does not 404 for an old slug", async () => {
    const res = await reviewAction({
      request: new Request("http://x", json({ content: "great skill" })),
      context, params: { slug: "old-slug" },
    } as never);
    expect(res.status).toBeLessThan(300);
  });

  it("rate does not 404 for an old slug", async () => {
    h.state.selectQueue = [[{ avg: 8, count: 1 }]];
    const res = await rate({
      request: new Request("http://x", json({ score: 8 })), context, params: { slug: "old-slug" },
    } as never);
    expect(res.status).toBeLessThan(300);
  });

  it("vote does not 404 for an old slug", async () => {
    h.state.selectQueue = [[{ count: 0 }], [], [{ net_votes: 1 }]];
    const res = await vote({
      request: new Request("http://x", json({ type: "up" })), context, params: { slug: "old-slug" },
    } as never);
    expect(res.status).toBeLessThan(300);
  });

  it("usage report does not 404 for an old slug", async () => {
    const res = await usage({
      request: new Request("http://x", {
        ...json({ skill_slug: "old-slug", outcome: "success" }),
        headers: { "content-type": "application/json", Authorization: "Bearer sk_test" },
      }),
      context, params: {},
    } as never);
    expect(res.status).toBeLessThan(300);
  });

  it("an unknown slug still 404s", async () => {
    h.state.selectQueue = [[{ count: 0 }]];
    const res = await vote({
      request: new Request("http://x", json({ type: "up" })), context, params: { slug: "nope" },
    } as never);
    expect(res.status).toBe(404);
  });
});
