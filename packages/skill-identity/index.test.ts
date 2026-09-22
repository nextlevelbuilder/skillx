import { describe, expect, it } from "vitest";
import {
  assignCanonicalSlugs,
  baseSlug,
  canonicalSlug,
  identityKey,
  leafName,
  parseSourceUrl,
  pickSlug,
  slugify,
  sourceIdentity,
} from "./index.js";

describe("slugify", () => {
  it("lowercases and collapses anything that is not alphanumeric or a dash", () => {
    expect(slugify("OpenAI / Skill_Creator!")).toBe("openai-skill-creator");
    expect(slugify("--already-fine--")).toBe("already-fine");
    expect(slugify(null)).toBe("");
  });
});

describe("parseSourceUrl", () => {
  it("extracts owner, repo and full path", () => {
    expect(
      parseSourceUrl("https://github.com/YPYT1/All-skills/tree/main/skills/ui-ux-pro-max"),
    ).toEqual({ owner: "YPYT1", repo: "All-skills", path: "skills/ui-ux-pro-max" });
  });

  it("keeps deep paths intact", () => {
    const parsed = parseSourceUrl(
      "https://github.com/YPYT1/All-skills/tree/main/skills/_local/clawd-skills/ui-ux-pro-max/",
    );
    expect(parsed?.path).toBe("skills/_local/clawd-skills/ui-ux-pro-max");
  });

  it("returns null for anything that is not a GitHub tree URL", () => {
    expect(parseSourceUrl("https://skillsmp.com/skills/x")).toBeNull();
    expect(parseSourceUrl(null)).toBeNull();
    expect(parseSourceUrl(undefined)).toBeNull();
  });
});

describe("leafName and baseSlug", () => {
  it("uses the last path segment, falling back to the repo name", () => {
    expect(leafName("skills/ui-ux-pro-max", "All-skills")).toBe("ui-ux-pro-max");
    expect(leafName("", "All-skills")).toBe("All-skills");
  });

  it("builds the readable base slug from owner + leaf", () => {
    expect(baseSlug("YPYT1", "skills/ui-ux-pro-max", "All-skills")).toBe("ypyt1-ui-ux-pro-max");
  });
});

describe("pickSlug", () => {
  it("keeps the base slug when it is free", () => {
    expect(pickSlug("a-b", "identity", new Set())).toBe("a-b");
  });

  it("appends a deterministic identity fragment when the base is taken", () => {
    const taken = new Set(["a-b"]);
    const first = pickSlug("a-b", "org/repo/path-one", taken);
    const again = pickSlug("a-b", "org/repo/path-one", taken);

    expect(first).toMatch(/^a-b-[0-9a-f]{8}$/);
    expect(again).toBe(first);
    expect(pickSlug("a-b", "org/repo/path-two", taken)).not.toBe(first);
  });
});

describe("canonicalSlug", () => {
  it("never derives a slug from a SKILL.md filename", () => {
    const slug = canonicalSlug({
      owner: "openai",
      repo: "skills",
      path: "skills/.system/skill-creator",
      taken: new Set(["openai-skill-creator"]),
    });

    expect(slug).not.toContain("ill-md");
    expect(slug).toMatch(/^openai-skill-creator-[0-9a-f]{8}$/);
  });
});

describe("sourceIdentity", () => {
  it("lowercases the repo label but keeps the path case", () => {
    const identity = sourceIdentity({
      sourceUrl: "https://github.com/YPYT1/All-skills/tree/main/Skills/UI-UX-Pro-Max",
    });

    expect(identity).toMatchObject({
      sourced: true,
      owner: "YPYT1",
      repo: "All-skills",
      path: "Skills/UI-UX-Pro-Max",
      repoLabel: "ypyt1/all-skills",
      identity: "ypyt1/all-skills/Skills/UI-UX-Pro-Max",
    });
  });

  it("falls back to a nosrc identity when there is no GitHub tree URL", () => {
    expect(sourceIdentity({ author: "Acme", name: "My Skill", slug: "my-skill" })).toMatchObject({
      sourced: false,
      identity: "nosrc:acme/my-skill",
      base: "my-skill",
      repoLabel: null,
    });
  });
});

describe("assignCanonicalSlugs", () => {
  const items = [
    {
      owner: "YPYT1",
      repo: "All-skills",
      path: "skills/_local/clawd-skills/ui-ux-pro-max",
      identity: identityKey("YPYT1/All-skills", "skills/_local/clawd-skills/ui-ux-pro-max"),
    },
    {
      owner: "YPYT1",
      repo: "All-skills",
      path: "skills/ui-ux-pro-max",
      identity: identityKey("YPYT1/All-skills", "skills/ui-ux-pro-max"),
    },
    {
      owner: "openai",
      repo: "codex",
      path: "codex-rs/core/src/skills/assets/samples/skill-creator",
      identity: identityKey("openai/codex", "codex-rs/core/src/skills/assets/samples/skill-creator"),
    },
  ];

  it("assigns unique, `-ill-md`-free slugs", () => {
    const slugs = [...assignCanonicalSlugs(items).values()];

    expect(new Set(slugs).size).toBe(items.length);
    expect(slugs.some((slug) => slug.includes("ill-md"))).toBe(false);
  });

  it("keeps repositories that share a name but not an owner apart", () => {
    const slugs = assignCanonicalSlugs([
      {
        owner: "antfu",
        repo: "skills",
        path: "skills/vue-best-practices",
        identity: identityKey("antfu/skills", "skills/vue-best-practices"),
      },
      {
        owner: "vuejs-ai",
        repo: "skills",
        path: "skills/vue-best-practices",
        identity: identityKey("vuejs-ai/skills", "skills/vue-best-practices"),
      },
    ]);

    expect(slugs.size).toBe(2);
    expect(new Set(slugs.values()).size).toBe(2);
  });

  it("is independent of input order", () => {
    const forward = assignCanonicalSlugs(items);
    const reversed = assignCanonicalSlugs([...items].reverse());

    for (const [identity, slug] of forward) {
      expect(reversed.get(identity)).toBe(slug);
    }
  });
});
