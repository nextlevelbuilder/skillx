/**
 * Cross-surface parity.
 *
 * Phase 1's claim is that API, CLI, MCP, and Markdown all give one answer for
 * one listing, because they delegate to one compatibility engine. Unit tests
 * inside each surface cannot show that; they would keep passing if a surface
 * quietly grew its own rule. These tests compare the surfaces against each
 * other, so a divergence between any two of them fails here.
 *
 * The MCP case drives the real tool through `callTool` with only the storage
 * layer stubbed, so it exercises the handler and the protocol envelope rather
 * than a re-implementation of them.
 *
 * The CLI is not imported here: `apps/web/tsconfig.cloudflare.json` lists its own
 * files only, so a cross-package import fails the project boundary. The CLI's
 * rule is pinned by value in packages/cli/src/lib/skill-lookup.test.ts, and its
 * drift risk is that it is the one surface holding a hand-written mirror of
 * `isCompatibilityActionable` instead of calling it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPATIBILITY_STATUSES,
  isCompatibilityActionable,
  resolveCatalogCompatibility,
  toCompatibilitySummary,
  type CompatibilityStatus,
} from "@skillx/contracts";

const h = vi.hoisted(() => {
  const state = { row: null as Record<string, unknown> | null };
  /** Minimal thenable mimicking drizzle's chainable query builder. */
  function chain(result: unknown) {
    const promise = Promise.resolve(result);
    const self = {
      from: () => self,
      where: () => self,
      orderBy: () => self,
      limit: () => self,
      get: () => Promise.resolve(Array.isArray(result) ? (result[0] ?? null) : result),
      then: (ok: unknown, bad: unknown) => promise.then(ok as never, bad as never),
    };
    return self;
  }
  return { state, chain };
});

vi.mock("~/lib/db", () => ({
  getDb: () => ({ select: () => h.chain(h.state.row ? [h.state.row] : []) }),
}));

import { listingInputs, resolveRowCompatibility } from "~/lib/compatibility/catalog-compatibility";
import { callTool } from "~/lib/mcp/tools";
import { renderSkillMarkdown } from "~/lib/markdown/skill-markdown";

const ROW = {
  id: "skill_1",
  slug: "find-skills",
  name: "Find Skills",
  description: "Discovery helper",
  author: "vercel",
  category: "discovery",
  content: "# Find Skills\n\nBody.",
  is_paid: 0,
  price_cents: 0,
  version: "1.2.0",
  risk_label: "safe",
  install_command: "skillx use find-skills",
  source_url: null,
  scripts: null,
  avg_rating: 4.5,
  rating_count: 2,
  install_count: 10,
  created_at: new Date(0),
  updated_at: new Date(0),
};

function rowWith(declaration: unknown) {
  return { ...ROW, compatibility_json: declaration === undefined ? null : JSON.stringify(declaration) };
}

const TARGET = { runtime: "agentkit", version: "1.2.0" };
const CTX = { env: {} as never, userId: null };

async function mcpCheck(row: Record<string, unknown>, target = "agentkit@1.2.0") {
  h.state.row = row;
  const result = await callTool("check_compatibility", { slug: ROW.slug, target }, CTX);
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

beforeEach(() => {
  h.state.row = null;
});

describe("actionability uses the contract's rule, across the whole vocabulary", () => {
  it("treats only declared and verified as support", () => {
    const actionable = COMPATIBILITY_STATUSES.filter((s: CompatibilityStatus) =>
      isCompatibilityActionable(s),
    );
    expect([...actionable].sort()).toEqual(["declared", "verified"]);
  });

  it("never rates `unknown` as support", () => {
    expect(isCompatibilityActionable("unknown")).toBe(false);
  });
});

describe("the web adapter adds no rule of its own", () => {
  const declarations: Array<[string, unknown]> = [
    ["no declaration at all", undefined],
    ["a declared range", { agentkit: { status: "declared", versions: ">=1.0.0 <2.0.0" } }],
    ["an explicit unsupported", { agentkit: { status: "unsupported" } }],
    ["a version outside the range", { agentkit: { status: "declared", versions: ">=2.0.0" } }],
    ["an unparseable range", { agentkit: { status: "declared", versions: "not a range" } }],
  ];

  it.each(declarations)("matches the engine for %s", (_label, declaration) => {
    const row = rowWith(declaration);
    expect(resolveRowCompatibility(row, TARGET)).toEqual(
      resolveCatalogCompatibility(TARGET, listingInputs(row)),
    );
  });
});

describe("MCP returns the engine's answer unchanged", () => {
  it("matches the web adapter for a declared runtime", async () => {
    const row = rowWith({ agentkit: { status: "declared", versions: ">=1.0.0 <2.0.0" } });
    const expected = resolveRowCompatibility(row, TARGET);
    const actual = await mcpCheck(row);

    expect(actual.found).toBe(true);
    expect(actual.status).toBe(expected.status);
    expect(actual.reasons).toEqual(expected.reasons);
  });

  it("reports the same blocked decision as the engine for a version mismatch", async () => {
    const row = rowWith({ agentkit: { status: "declared", versions: ">=2.0.0" } });
    const expected = resolveRowCompatibility(row, TARGET);
    const actual = await mcpCheck(row);

    expect(actual.status).toBe(expected.status);
    expect(actual.status).toBe("blocked");
    expect(actual.reasons).toEqual(expected.reasons);
  });

  it("answers unknown for an undeclared runtime on both surfaces", async () => {
    const row = rowWith(undefined);
    expect(resolveRowCompatibility(row, TARGET).status).toBe("unknown");
    expect((await mcpCheck(row)).status).toBe("unknown");
  });

  it("reports a missing listing as not_found rather than unknown", async () => {
    // "no such listing" and "no claim was made" must not collapse into one answer.
    h.state.row = null;
    const result = await callTool("check_compatibility", { slug: "nope", target: "agentkit" }, CTX);
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;

    expect(parsed.found).toBe(false);
    expect(parsed.code).toBe("not_found");
  });
});

describe("Markdown shows the same status the engine returned", () => {
  function markdownFor(row: Record<string, unknown>) {
    // Built through the real summary adapter, so this also covers that conversion.
    const resolved = toCompatibilitySummary(resolveRowCompatibility(row, TARGET));
    return renderSkillMarkdown({
      siteUrl: "https://skillx.sh",
      skill: row as never,
      compatibility: [resolved],
      payloadGranted: true,
    });
  }

  it("renders declared as declared", () => {
    const row = rowWith({ agentkit: { status: "declared", versions: ">=1.0.0 <2.0.0" } });
    expect(markdownFor(row)).toContain("| agentkit | declared |");
  });

  it("renders a version mismatch as blocked, matching the engine", () => {
    const row = rowWith({ agentkit: { status: "declared", versions: ">=2.0.0" } });
    const markdown = markdownFor(row);

    expect(resolveRowCompatibility(row, TARGET).status).toBe("blocked");
    expect(markdown).toContain("| agentkit | blocked |");
  });

  it("never renders verified for a listing that has no evidence", () => {
    // A mutable listing has no artifact digest, so `verified` is unreachable.
    for (const [, declaration] of [
      ["declared", { agentkit: { status: "declared", versions: ">=1.0.0" } }],
      ["unsupported", { agentkit: { status: "unsupported" } }],
    ] as const) {
      expect(markdownFor(rowWith(declaration))).not.toContain("| agentkit | verified |");
    }
  });
});
