import { describe, expect, it } from "vitest";
import { planRegistration, type SkillSourceRef } from "./registration";

const HASHED = /-[0-9a-f]{8}$/;

function row(id: string, slug: string, sourceRepo: string | null, sourcePath: string | null): SkillSourceRef {
  return { id, slug, source_repo: sourceRepo, source_path: sourcePath };
}

describe("planRegistration", () => {
  it("registers both skills when two paths in one repo share a leaf folder name", () => {
    const takenSlugs = new Set<string>();

    const first = planRegistration({
      owner: "foo",
      repo: "bar",
      sourcePath: "a/ui-ux-pro-max",
      slugBase: "foo-ui-ux-pro-max",
      takenSlugs,
    });

    expect(first).toMatchObject({
      action: "create",
      slug: "foo-ui-ux-pro-max",
      source_repo: "foo/bar",
      source_path: "a/ui-ux-pro-max",
    });
    takenSlugs.add(first.slug);

    const second = planRegistration({
      owner: "foo",
      repo: "bar",
      sourcePath: "b/ui-ux-pro-max",
      slugBase: "foo-ui-ux-pro-max",
      takenSlugs,
    });

    expect(second.action).toBe("create");
    expect(second.source_path).toBe("b/ui-ux-pro-max");
    expect(second.slug).not.toBe(first.slug);
    expect(second.slug).toMatch(HASHED);
  });

  it("reports existing only for the same source identity", () => {
    const existing = row("row-1", "foo-ui-ux-pro-max", "foo/bar", "a/ui-ux-pro-max");

    const same = planRegistration({
      owner: "foo",
      repo: "bar",
      sourcePath: "a/ui-ux-pro-max",
      slugBase: "foo-ui-ux-pro-max",
      existing,
      takenSlugs: new Set(),
    });

    expect(same).toMatchObject({
      action: "existing",
      slug: "foo-ui-ux-pro-max",
      existingId: "row-1",
    });

    const differentPath = planRegistration({
      owner: "foo",
      repo: "bar",
      sourcePath: "b/ui-ux-pro-max",
      slugBase: "foo-ui-ux-pro-max",
      existing: null,
      takenSlugs: new Set(["foo-ui-ux-pro-max"]),
    });

    expect(differentPath.action).toBe("create");
  });

  it("does not hand out a slug that a legacy alias still owns", () => {
    const plan = planRegistration({
      owner: "foo",
      repo: "bar",
      sourcePath: "skills/ui-ux-pro-max",
      slugBase: "foo-ui-ux-pro-max",
      takenSlugs: new Set(["foo-ui-ux-pro-max", "foo-ui-ux-pro-max-ill-md"]),
    });

    expect(plan.action).toBe("create");
    expect(plan.slug).toMatch(HASHED);
  });

  it("addresses a repo-root skill as owner-repo with an empty source path", () => {
    const plan = planRegistration({
      owner: "openai",
      repo: "skill-creator",
      sourcePath: "",
      slugBase: "openai-skill-creator",
      takenSlugs: new Set(),
    });

    expect(plan).toMatchObject({
      action: "create",
      slug: "openai-skill-creator",
      source_repo: "openai/skill-creator",
      source_path: "",
    });
  });
});
