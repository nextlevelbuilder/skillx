import { describe, it, expect } from "vitest";
import { buildSkillEndpoint, parseIdentifier, parseRepoPath } from "./use.js";

describe("parseIdentifier", () => {
  it("classifies space-containing input as search", () => {
    const result = parseIdentifier("ui ux design");
    expect(result.type).toBe("search");
    expect(result.parts).toEqual(["ui ux design"]);
  });

  it("classifies a three-part repo path as repo-path", () => {
    const result = parseIdentifier("binhmuc/autobot-review/ui-ux-pro-max");
    expect(result.type).toBe("repo-path");
    expect(result.parts).toEqual(["binhmuc", "autobot-review", "ui-ux-pro-max"]);
  });

  it("classifies two-part slash input as two-part", () => {
    const result = parseIdentifier("vercel-labs/find-skills");
    expect(result.type).toBe("two-part");
    expect(result.parts).toEqual(["vercel-labs", "find-skills"]);
  });

  it("classifies single word as slug", () => {
    const result = parseIdentifier("find-skills");
    expect(result.type).toBe("slug");
    expect(result.parts).toEqual(["find-skills"]);
  });

  it("handles author/skill-name format", () => {
    const result = parseIdentifier("nextlevelbuilder/ui-ux-pro-max");
    expect(result.type).toBe("two-part");
    expect(result.parts).toEqual(["nextlevelbuilder", "ui-ux-pro-max"]);
  });

  it("keeps every segment of a deep repo path", () => {
    const result = parseIdentifier("YPYT1/All-skills/skills/_local/clawd-skills/ui-ux-pro-max");
    expect(result.type).toBe("repo-path");
    expect(result.parts).toEqual([
      "YPYT1",
      "All-skills",
      "skills",
      "_local",
      "clawd-skills",
      "ui-ux-pro-max",
    ]);
  });

  it("handles mixed spaces and slashes (space wins)", () => {
    const result = parseIdentifier("my skill / name");
    expect(result.type).toBe("search");
    expect(result.parts).toEqual(["my skill / name"]);
  });

  it("treats empty string as slug", () => {
    const result = parseIdentifier("");
    expect(result.type).toBe("slug");
    expect(result.parts).toEqual([""]);
  });
});

describe("parseRepoPath", () => {
  it("keeps the whole path and takes the readable slug from the leaf", () => {
    expect(parseRepoPath(["YPYT1", "All-skills", "skills", "_local", "clawd-skills", "ui-ux-pro-max"])).toEqual({
      slug: "ypyt1-ui-ux-pro-max",
      identity: {
        repo: "YPYT1/All-skills",
        path: "skills/_local/clawd-skills/ui-ux-pro-max",
      },
    });
  });

  it("handles org/repo with no path as the repo-root skill", () => {
    expect(parseRepoPath(["openai", "skill-creator"])).toEqual({
      slug: "openai-skill-creator",
      identity: { repo: "openai/skill-creator", path: "" },
    });
  });
});

describe("buildSkillEndpoint", () => {
  it("builds a plain slug endpoint when no identity is given", () => {
    expect(buildSkillEndpoint("find-skills")).toBe("/api/skills/find-skills");
  });

  it("pins the lookup to the full source path", () => {
    const endpoint = buildSkillEndpoint("ypyt1-ui-ux-pro-max", {
      repo: "YPYT1/All-skills",
      path: "skills/_local/clawd-skills/ui-ux-pro-max",
    });
    const url = new URL(endpoint, "https://skillx.sh");

    expect(url.pathname).toBe("/api/skills/ypyt1-ui-ux-pro-max");
    expect(url.searchParams.get("repo")).toBe("YPYT1/All-skills");
    expect(url.searchParams.get("path")).toBe("skills/_local/clawd-skills/ui-ux-pro-max");
  });
});
