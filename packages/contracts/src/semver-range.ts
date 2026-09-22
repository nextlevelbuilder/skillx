/**
 * Minimal semver evaluation for SkillX compatibility declarations.
 *
 * Supported range syntax (v1): whitespace-separated AND comparators such as
 * `>=2.0.0 <3.0.0`, a single exact version such as `1.2.3`, and the wildcards
 * `*` / `x`. OR ranges (`||`), caret (`^`), tilde (`~`), and hyphen ranges are
 * intentionally NOT supported in v1: they return `null`, which the caller must
 * treat as "cannot decide", i.e. `unknown` rather than support.
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(input: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(input.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // A prerelease sorts before the same release version.
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && b.prerelease) return a.prerelease.localeCompare(b.prerelease);
  return 0;
}

function satisfiesComparator(version: ParsedVersion, operator: string, target: ParsedVersion): boolean {
  const cmp = compareVersions(version, target);
  switch (operator) {
    case ">=":
      return cmp >= 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case "<":
      return cmp < 0;
    default:
      return cmp === 0;
  }
}

/**
 * @returns `true` when the version satisfies the range, `false` when it does
 * not, and `null` when the version or the range cannot be parsed.
 */
export function satisfiesRange(version: string, range: string): boolean | null {
  const parsedVersion = parseVersion(version);
  if (!parsedVersion) return null;

  const trimmed = range.trim();
  if (trimmed === "" || trimmed === "*" || trimmed === "x" || trimmed === "latest") return true;

  const tokens = trimmed.split(/\s+/);
  for (const token of tokens) {
    const match = /^(>=|<=|>|<|=)?(.+)$/.exec(token);
    if (!match) return null;

    const operator = match[1] ?? "=";
    if (operator === "^" || operator === "~") return null;

    const parsedTarget = parseVersion(match[2] as string);
    if (!parsedTarget) return null;

    if (!satisfiesComparator(parsedVersion, operator, parsedTarget)) return false;
  }

  return true;
}
