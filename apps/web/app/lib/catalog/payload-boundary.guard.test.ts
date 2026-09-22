/**
 * Executable guard for the protected payload boundary.
 *
 * A plain `grep` for `.content` cannot catch the real failure mode: a route that
 * returns a FULL `skills` row (including `content`) as loader data, which React
 * Router then serializes into the SSR HTML.
 *
 * The guard enforces three separate things, because "imports the boundary" alone
 * is not proof that anything was gated:
 *   1. every unprojected `skills` read is either gated or an allowlisted
 *      non-response path,
 *   2. every gating module actually CALLS `gateSkillRow`, not merely imports it,
 *   3. every response path imports one of the gating modules.
 *
 * Sources are read through Vite's `import.meta.glob` so the test needs no Node
 * built-ins and stays inside the app's browser-oriented tsconfig.
 */

import { describe, expect, it } from "vitest";

/** Module specifiers that legitimately apply the protected payload boundary. */
const GATED_IMPORTS = [
  "~/lib/catalog/protected-content",
  "./protected-content",
  "~/lib/catalog/featured-skills",
  "~/lib/catalog/profile-skill-queries",
  "~/lib/catalog/skill-detail-data",
  "~/lib/search/search-result-projection",
];

/**
 * Modules that apply the gate must actually apply it. Importing the resolver
 * without calling anything would leave rows ungated, which is why this is
 * asserted separately from the import check.
 */
const GATED_MODULES = [
  "lib/catalog/protected-content.ts",
  "lib/catalog/featured-skills.ts",
  "lib/catalog/profile-skill-queries.ts",
  "lib/catalog/skill-detail-data.ts",
  "lib/github/skill-import.ts",
  "lib/search/search-result-projection.ts",
];

/**
 * The functions that actually apply the boundary. A gating module must call at
 * least one of them; `gateSkillRow` for raw rows, and the response builders for
 * modules that already hold a public DTO.
 */
const GATE_CALLS = [
  "gateSkillRow(",
  "buildCatalogListingResponse(",
  "buildSkillDetailResponse(",
];

/**
 * Paths that may read unprojected `skills` rows WITHOUT the resolver.
 * Every entry needs a reason explaining why it is not a payload response path.
 *
 * The guard requires an explicit decision here, so a new route that returns full
 * rows cannot slip in silently.
 */
const NON_RESPONSE_PATHS: Record<string, string> = {
  "lib/db/skill-detail-queries.ts":
    "shared query layer; every caller gates rows before responding",
  "lib/github/skill-insert.ts":
    "insert helper; returns the inserted row to skill-import.ts, which gates it before responding",
  "routes/api.skill-favorite.ts":
    "reads the skill for its id only; the response carries favorite state, not the row",
  "routes/api.skill-rate.ts":
    "reads the skill for its id only; the response carries the rating summary",
  "routes/api.skill-review.ts":
    "reads the skill for its id only; the response carries the created review",
  "routes/api.usage-report.ts":
    "reads the skill for its id only; the response is an acknowledgement",
};

/** Response paths whose rows must be gated before they can be serialized. */
const GATED_RESPONSE_PATHS = [
  "routes/home.tsx",
  "routes/profile.tsx",
  "routes/skill-detail.tsx",
  "routes/api.skill-detail.ts",
];

const RAW_SOURCES = import.meta.glob("../../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * Normalizes glob keys, which are relative to this file (`app/lib/catalog/`),
 * into app-relative paths such as `routes/home.tsx`.
 */
function toAppRelative(globKey: string): string {
  const segments = `lib/catalog/${globKey}`.split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/");
}

const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_SOURCES)
    .filter(([key]) => !/\.test\.tsx?$/.test(key))
    .map(([key, value]) => [toAppRelative(key), value]),
);

/** True when `.select()` is immediately followed by `.from(skills)`. */
function readsUnprojectedSkillsRows(source: string): boolean {
  return /\.select\(\s*\)\s*\.from\(\s*skills\s*\)/.test(source);
}

function importsAGate(source: string): boolean {
  return GATED_IMPORTS.some((specifier) => source.includes(specifier));
}

describe("protected payload boundary guard", () => {
  it("scans a non-trivial number of source files", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
  });

  it("every unprojected `skills` read is either gated or an allowlisted non-response path", () => {
    const violations: string[] = [];

    for (const [rel, source] of Object.entries(SOURCES)) {
      if (!readsUnprojectedSkillsRows(source)) continue;
      if (!importsAGate(source) && !(rel in NON_RESPONSE_PATHS)) violations.push(rel);
    }

    expect(
      violations,
      "These modules read full skills rows without the resolver and are not allowlisted:\n" +
        `${violations.join("\n")}\n` +
        "Fix by importing a gating module and calling gateSkillRow, or add a reasoned allowlist entry.",
    ).toEqual([]);
  });

  it("every gating module actually applies the gate, not just imports it", () => {
    const notApplying = GATED_MODULES.filter((rel) => {
      const source = SOURCES[rel];
      return source === undefined || !GATE_CALLS.some((call) => source.includes(call));
    });
    expect(notApplying, "These modules import the boundary but never apply it").toEqual([]);
  });

  it("every response path imports a gating module", () => {
    const missing = GATED_RESPONSE_PATHS.filter((rel) => {
      const source = SOURCES[rel];
      return source === undefined || !importsAGate(source);
    });
    expect(missing, "These response paths lost their protected payload boundary").toEqual([]);
  });

  it("keeps the allowlist honest: entries must still exist and still need the exemption", () => {
    const stale: string[] = [];
    for (const rel of Object.keys(NON_RESPONSE_PATHS)) {
      const source = SOURCES[rel];
      if (source === undefined) {
        stale.push(`${rel} (file no longer exists)`);
        continue;
      }
      if (!readsUnprojectedSkillsRows(source)) {
        stale.push(`${rel} (no longer reads unprojected skills rows)`);
      }
    }
    expect(stale, "Remove stale allowlist entries").toEqual([]);
  });

  it("delegates the decision instead of inlining its own policy", () => {
    const source = SOURCES["lib/catalog/protected-content.ts"] ?? "";
    expect(source).toContain("decidePayloadAccess");
  });
});
