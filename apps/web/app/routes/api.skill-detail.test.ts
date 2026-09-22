/**
 * Route-level authorization tests for the public skill detail API.
 *
 * The unit tests in `lib/catalog/dto-boundary.test.ts` prove the gate functions
 * behave correctly, and the static guard proves every serve path calls one. This
 * file closes the remaining gap the auditor identified: exercising the actual
 * route handler — the surface the acceptance criterion names — and asserting on
 * the real HTTP response body for both a free and a protected listing.
 *
 * The D1 client is replaced with a queue-backed stub so the loader runs
 * unmodified; only the storage layer is faked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    selectQueue: [] as unknown[],
    sessionUser: null as { id: string } | null,
  };

  /** Minimal thenable that mimics drizzle's chainable query builder. */
  function selectChain(result: unknown) {
    const promise = Promise.resolve(result);
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      get: () => Promise.resolve(Array.isArray(result) ? (result[0] ?? null) : result),
      execute: () => Promise.resolve(),
      then: (onFulfilled: unknown, onRejected: unknown) =>
        promise.then(onFulfilled as never, onRejected as never),
    };
    return chain;
  }

  return { state, selectChain };
});

vi.mock("~/lib/db", () => ({
  getDb: () => ({
    select: () => h.selectChain(h.state.selectQueue.shift() ?? []),
    update: () => h.selectChain(undefined),
  }),
}));

vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (h.state.sessionUser ? { user: h.state.sessionUser } : null),
}));

vi.mock("~/lib/db/skill-detail-queries", () => ({
  fetchSkillReferences: async () => [],
}));

import { loader } from "./api.skill-detail";

/** Longer than the 300-char stub threshold so the GitHub backfill path is skipped. */
const SKILL_MD = `# Find Skills\n\n${"A paragraph of real SKILL.md body content. ".repeat(12)}`;

function skillRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "skill_1",
    slug: "find-skills",
    name: "Find Skills",
    author: "vercel",
    description: "Discovery helper",
    category: "discovery",
    content: SKILL_MD,
    is_paid: false,
    price_cents: 0,
    avg_rating: 0,
    rating_count: 0,
    install_count: 0,
    github_stars: 0,
    version: "1.0.0",
    // null keeps the loader away from the GitHub stub-backfill branch.
    source_url: null,
    install_command: "skillx use find-skills",
    risk_label: "safe",
    scripts: null,
    created_at: new Date(0),
    updated_at: new Date(0),
    ...overrides,
  };
}

/** Queues the loader's reads: skill row, reviews, rating summary, then favorites. */
function queueReads(row: unknown, withSession: boolean) {
  h.state.selectQueue = [[row], [], { avgRating: 0, ratingCount: 0 }];
  if (withSession) h.state.selectQueue.push([]);
}

async function callLoader(slug = "find-skills") {
  const response = (await loader({
    params: { slug },
    request: new Request(`https://skillx.sh/api/skills/${slug}`),
    context: { cloudflare: { env: { DB: {} } } },
  } as never)) as Response;
  return { response, body: (await response.clone().json()) as Record<string, never> };
}

beforeEach(() => {
  h.state.selectQueue = [];
  h.state.sessionUser = null;
});

describe("GET /api/skills/:slug — route-level payload boundary", () => {
  it("returns the SKILL.md payload for a free public listing to an anonymous caller", async () => {
    queueReads(skillRow(), false);
    const { response, body } = await callLoader();

    expect(response.status).toBe(200);
    expect((body.skill as never as { content: string }).content).toBe(SKILL_MD);
  });

  it("returns the payload for a free listing to an authenticated caller too", async () => {
    h.state.sessionUser = { id: "user_1" };
    queueReads(skillRow(), true);
    const { body } = await callLoader();

    expect((body.skill as never as { content: string }).content).toBe(SKILL_MD);
  });

  it("never exposes the payload of a protected listing to an anonymous caller", async () => {
    queueReads(skillRow({ is_paid: true, price_cents: 1500 }), false);
    const { response, body } = await callLoader();

    expect(response.status).toBe(200);
    expect(body.skill as never as Record<string, unknown>).not.toHaveProperty("content");
    expect(await response.clone().text()).not.toContain("A paragraph of real SKILL.md body content.");
  });

  it("still denies a protected listing to an authenticated caller with no entitlement", async () => {
    // Entitlement resolution arrives in Phase 5, so a session alone grants nothing.
    h.state.sessionUser = { id: "user_1" };
    queueReads(skillRow({ is_paid: true, price_cents: 1500 }), true);
    const { body } = await callLoader();

    expect(body.skill as never as Record<string, unknown>).not.toHaveProperty("content");
  });

  it("keeps every field the skill page and `skillx use` render in both cases", async () => {
    queueReads(skillRow({ is_paid: true }), false);
    const { body } = await callLoader();

    for (const field of [
      "slug",
      "name",
      "description",
      "category",
      "avg_rating",
      "risk_label",
      "install_command",
    ]) {
      expect(body.skill as never as Record<string, unknown>, field).toHaveProperty(field);
    }
  });

  it("preserves the response envelope the CLI depends on", async () => {
    queueReads(skillRow(), false);
    const { body } = await callLoader();

    for (const key of ["skill", "reviews", "isFavorited", "ratingSummary", "references", "scripts"]) {
      expect(body, key).toHaveProperty(key);
    }
  });

  it("returns 404 for an unknown slug without reading a payload", async () => {
    h.state.selectQueue = [[]];
    const { response, body } = await callLoader("does-not-exist");

    expect(response.status).toBe(404);
    expect(body).not.toHaveProperty("skill");
  });
});
