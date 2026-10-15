/**
 * The `--compatible <runtime>` search filter.
 *
 * Compatibility lives in a JSON column that FTS5 and Vectorize cannot index, so
 * the filter cannot run in the database. It runs over the projected page instead,
 * and it reports what it did: a filter that silently drops undecidable rows would
 * make an agent believe the catalog is smaller than it is.
 *
 * Only `declared` and `verified` count as a match. `unknown` is the absence of a
 * claim, never a claim of support.
 */

import { isCompatibilityActionable, type CompatibilityStatus } from "@skillx/contracts";
import type { SearchResult } from "./search-result-projection";
import { isRuntimeId } from "~/lib/compatibility/catalog-compatibility";

export interface CompatibilityFilterRequest {
  runtime: string;
}

export interface CompatibilityFilterReport {
  runtime: string;
  /** Rows the filter examined before the page was truncated to the limit. */
  evaluated: number;
  matched: number;
  /** Rows that declare nothing for this runtime, so support is undecidable. */
  undecided: number;
  /** Rows that declare the runtime but refuse it (unsupported or blocked). */
  refused: number;
  /** The over-fetched pool filled up: further matches may exist beyond it. */
  poolExhausted: boolean;
}

/** One filter run: the page to return plus the honest account of the filtering. */
export interface CompatibilityFilterOutcome {
  results: SearchResult[];
  report: CompatibilityFilterReport;
}

/** How many candidates to pull before filtering, per requested page size. */
const POOL_MULTIPLIER = 5;
/** Hard cap on the candidate pool so one filter call cannot scan the catalog. */
export const MAX_COMPATIBILITY_POOL = 100;

export function compatibilityPoolSize(limit: number): number {
  return Math.min(Math.max(limit * POOL_MULTIPLIER, limit), MAX_COMPATIBILITY_POOL);
}

/**
 * True when the search filled the whole candidate pool, so candidates beyond it
 * may exist. Any pool size counts, not only the hard cap.
 */
export function isPoolExhausted(candidateCount: number, poolLimit: number): boolean {
  return poolLimit > 0 && candidateCount >= poolLimit;
}

function statusFor(result: SearchResult, runtime: string): CompatibilityStatus | null {
  const entry = result.compatibility?.find((summary) => summary.runtime === runtime);
  return entry ? entry.status : null;
}

export function applyCompatibilityFilter(
  results: SearchResult[],
  request: CompatibilityFilterRequest,
  limit: number,
  poolExhausted = false,
): CompatibilityFilterOutcome {
  const matched: SearchResult[] = [];
  let undecided = 0;
  let refused = 0;

  for (const result of results) {
    const status = statusFor(result, request.runtime);
    if (status === null) {
      undecided += 1;
      continue;
    }
    if (isCompatibilityActionable(status)) {
      matched.push(result);
      continue;
    }
    refused += 1;
  }

  return {
    results: matched.slice(0, limit),
    report: {
      runtime: request.runtime,
      evaluated: results.length,
      matched: matched.length,
      undecided,
      refused,
      poolExhausted,
    },
  };
}

export const INVALID_COMPATIBLE_MESSAGE =
  "compatible must be a runtime id (lowercase letters, digits, '.', '_' or '-'), optionally runtime@version";

export type ParsedCompatibilityFilter =
  | { ok: true; filter: CompatibilityFilterRequest | null }
  | { ok: false; error: string };

/**
 * Parses a `runtime` or `runtime@version` filter value.
 *
 * Empty input means "no filter". A value whose runtime is outside the identifier
 * grammar is refused; the raw input is never echoed back.
 */
export function parseCompatibilityFilter(value: unknown): ParsedCompatibilityFilter {
  if (value === null || value === undefined) return { ok: true, filter: null };
  if (typeof value !== "string") return { ok: false, error: INVALID_COMPATIBLE_MESSAGE };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, filter: null };
  // A version is not evaluated here: version-aware answers come from
  // `skillx check --target`, which reads the detail payload for one package.
  const [runtime] = trimmed.split("@");
  if (!runtime || !isRuntimeId(runtime)) return { ok: false, error: INVALID_COMPATIBLE_MESSAGE };
  return { ok: true, filter: { runtime } };
}

/** Human-readable reason a filtered page came back empty. */
export function emptyFilterNote(report: CompatibilityFilterReport): string {
  if (report.evaluated === 0) {
    return "The query matched no listings, so the compatibility filter had nothing to examine.";
  }
  return (
    `No examined listing declares support for '${report.runtime}'. ` +
    `Examined ${report.evaluated} candidate(s): ${report.undecided} declare nothing, ` +
    `${report.refused} declare the runtime but refuse it. ` +
    "A missing declaration is not support, so these were not returned." +
    (report.poolExhausted ? " The candidate pool was full; a narrower query may surface more." : "")
  );
}
