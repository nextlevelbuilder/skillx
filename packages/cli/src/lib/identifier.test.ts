/**
 * Identifier mapping.
 *
 * These lock the slugs `use` already resolved, now that `use`, `inspect` and
 * `check` share one implementation: a mapping change here would silently redirect
 * every command at a different skill.
 */

import { describe, expect, it } from "vitest";
import { parseIdentifier, planResolution } from "./identifier.js";

describe("parseIdentifier", () => {
  it("classifies space-containing input as search", () => {
    expect(parseIdentifier("ui ux design")).toEqual({ type: "search", parts: ["ui ux design"] });
  });

  it("classifies three-part slash input as three-part", () => {
    expect(parseIdentifier("org/repo/skill")).toEqual({
      type: "three-part",
      parts: ["org", "repo", "skill"],
    });
  });

  it("classifies two-part slash input as two-part", () => {
    expect(parseIdentifier("author/skill")).toEqual({ type: "two-part", parts: ["author", "skill"] });
  });

  it("classifies a bare word as slug", () => {
    expect(parseIdentifier("find-skills")).toEqual({ type: "slug", parts: ["find-skills"] });
  });
});

describe("planResolution", () => {
  it("maps a three-part identifier to org-skill and registers the repo", () => {
    const plan = planResolution("binhmuc/autobot-review/ui-ux-pro-max");
    expect(plan.slug).toBe("binhmuc-ui-ux-pro-max");
    expect(plan.registerFallback).toEqual({
      owner: "binhmuc",
      repo: "autobot-review",
      skill_path: "ui-ux-pro-max",
    });
  });

  it("maps a two-part identifier to author-skill and scans the repo", () => {
    const plan = planResolution("vercel-labs/find-skills");
    expect(plan.slug).toBe("vercel-labs-find-skills");
    expect(plan.registerFallback).toEqual({ owner: "vercel-labs", repo: "find-skills", scan: true });
  });

  it("lowercases the mapped slug", () => {
    expect(planResolution("Vercel-Labs/Find-Skills").slug).toBe("vercel-labs-find-skills");
  });

  it("treats a bare word as a direct slug with a search fallback", () => {
    const plan = planResolution("find-skills");
    expect(plan.slug).toBe("find-skills");
    expect(plan.searchFallback).toBe(true);
    expect(plan.registerFallback).toBeUndefined();
  });

  it("has no slug in search mode", () => {
    const plan = planResolution("ui ux design");
    expect(plan.slug).toBeNull();
    expect(plan.parsed.type).toBe("search");
  });

  it("preserves the identifier as typed for display", () => {
    expect(planResolution("Vercel-Labs/Find-Skills").displayId).toBe("Vercel-Labs/Find-Skills");
  });
});
