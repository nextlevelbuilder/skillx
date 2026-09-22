import { describe, expect, it } from "vitest";
import {
  LEGACY_SLUG_ALIASES,
  isAlreadyMigrated,
  resolveLegacySlug,
  toListingMigration,
} from "./legacy-listing";
import type { LegacySkillRow } from "./legacy-listing";

function legacyRow(overrides: Partial<LegacySkillRow> = {}): LegacySkillRow {
  return {
    id: "skill_1",
    slug: "zuey-review-guardrails",
    source_url: "https://github.com/zuey/skills/tree/main/review-guardrails",
    version: "1.0.0",
    created_at: new Date("2026-02-12T00:00:00.000Z"),
    ...overrides,
  };
}

describe("legacy listing migration", () => {
  it("preserves the existing slug and public path", () => {
    const migration = toListingMigration(legacyRow());
    expect(migration.slug).toBe("zuey-review-guardrails");
    expect(migration.canonicalPath).toBe("/skills/zuey-review-guardrails");
  });

  it("never invents an immutable release, digest, or version immutability", () => {
    const migration = toListingMigration(legacyRow());
    expect(migration.releaseId).toBeNull();
    expect(migration.releaseDigest).toBeNull();
    expect(migration.immutable).toBe(false);
  });

  it("keeps the declared version as a label, not as release identity", () => {
    const migration = toListingMigration(legacyRow({ version: "2.3.1" }));
    expect(migration.declaredVersion).toBe("2.3.1");
    expect(migration.releaseId).toBeNull();
  });

  it("preserves rows with no source url or version", () => {
    const migration = toListingMigration(legacyRow({ source_url: null, version: null }));
    expect(migration.sourceUrl).toBeNull();
    expect(migration.declaredVersion).toBeNull();
    expect(migration.canonicalPath).toBe("/skills/zuey-review-guardrails");
  });

  it("resolves every current slug to itself while no alias is declared", () => {
    expect(Object.keys(LEGACY_SLUG_ALIASES)).toHaveLength(0);
    for (const slug of ["zuey-review-guardrails", "agentkit-engineer", "claude-code-hooks"]) {
      expect(resolveLegacySlug(slug)).toBe(slug);
    }
  });

  it("keeps slugs that contain collision artifacts resolvable", () => {
    // Real defect tracked by issue #25: folder-derived slugs produce mangled
    // values such as `-ill-md`. They must keep resolving after migration.
    const mangled = toListingMigration(legacyRow({ slug: "some-repo-ill-md" }));
    expect(mangled.slug).toBe("some-repo-ill-md");
    expect(mangled.canonicalPath).toBe("/skills/some-repo-ill-md");
  });

  it("does not mutate the input row", () => {
    const row = legacyRow();
    const snapshot = { ...row };
    toListingMigration(row);
    expect(row).toEqual(snapshot);
  });

  it("recognises rows that carry a usable identity", () => {
    expect(isAlreadyMigrated(legacyRow())).toBe(true);
    expect(isAlreadyMigrated(legacyRow({ id: "  " }))).toBe(false);
    expect(isAlreadyMigrated(legacyRow({ slug: "" }))).toBe(false);
  });
});
