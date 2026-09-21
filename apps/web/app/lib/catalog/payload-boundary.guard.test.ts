/**
 * Executable guard for the protected payload boundary.
 *
 * A plain `grep` for `.content` cannot catch the real failure mode: a route that
 * returns a FULL `skills` row (including `content`) as loader data, which React
 * Router then serializes into the SSR HTML.
 *
 * This test therefore scans serve-path sources and enforces one rule: a module
 * that reads unprojected `skills` rows must either import the boundary module
 * (so every row is gated before it is returned) or be an explicitly allowlisted
 * non-response path. Adding a new public route that leaks full rows fails here.
 *
 * Sources are read through Vite's `import.meta.glob` so the test needs no Node
 * built-ins and stays inside the app's browser-oriented tsconfig.
 */

import { describe, expect, it } from "vitest";

const BOUNDARY_IMPORT = "~/lib/catalog/protected-content";

const RAW_SOURCES = import.meta.glob("../../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

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
  "routes/api.skill-register.ts":
    "import/registration writes; stores rows without serving payload",
  "routes/api.skill-favorite.ts":
    "reads the skill for its id only; the response carries favorite state, not the row",
  "routes/api.skill-rate.ts":
    "reads the skill for its id only; the response carries the rating summary",
  "routes/api.skill-review.ts":
    "reads the skill for its id only; the response carries the created review",
  "routes/api.usage-report.ts":
    "reads the skill for its id only; the response is an acknowledgement",
};

/** Response paths that must read rows only through the boundary. */
const GATED_RESPONSE_PATHS = [
  "routes/home.tsx",
  "routes/profile.tsx",
  "routes/skill-detail.tsx",
  "routes/api.skill-detail.ts",
  "lib/search/search-result-projection.ts",
];

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

describe("protected payload boundary guard", () => {
  it("scans a non-trivial number of source files", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
  });

  it("every unprojected `skills` read is either gated or an allowlisted non-response path", () => {
    const violations: string[] = [];

    for (const [rel, source] of Object.entries(SOURCES)) {
      if (!readsUnprojectedSkillsRows(source)) continue;
      const isGated = source.includes(BOUNDARY_IMPORT);
      const isAllowlisted = rel in NON_RESPONSE_PATHS;
      if (!isGated && !isAllowlisted) violations.push(rel);
    }

    expect(
      violations,
      "These modules read full skills rows without the resolver and are not allowlisted:\n" +
        `${violations.join("\n")}\n` +
        `Fix by importing '${BOUNDARY_IMPORT}' and gating each row, or add a reasoned allowlist entry.`,
    ).toEqual([]);
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

  it("every gated response path actually imports the boundary", () => {
    const missing = GATED_RESPONSE_PATHS.filter((rel) => {
      const source = SOURCES[rel];
      return source === undefined || !source.includes(BOUNDARY_IMPORT);
    });
    expect(missing, "These response paths lost their protected payload boundary").toEqual([]);
  });

  it("delegates the decision instead of inlining its own policy", () => {
    const source = SOURCES["lib/catalog/protected-content.ts"] ?? "";
    expect(source).toContain("decidePayloadAccess");
    expect(source).toContain("gateSkillRow");
  });
});
