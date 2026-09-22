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

/** Parses a `runtime` or `runtime@version` filter value. */
export function parseCompatibilityFilter(value: string | null | undefined): CompatibilityFilterRequest | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  // A version is not evaluated here: version-aware answers come from
  // `skillx check --target`, which reads the detail payload for one package.
  const [runtime] = trimmed.split("@");
  if (!runtime) return null;
  return { runtime };
}

/** Human-readable reason a page came back empty despite the catalog matching. */
export function emptyFilterNote(report: CompatibilityFilterReport): string {
  return (
    `No listing declares support for '${report.runtime}'. ` +
    `Examined ${report.evaluated} candidate(s): ${report.undecided} declare nothing, ` +
    `${report.refused} declare the runtime but refuse it. ` +
    "A missing declaration is not support, so these were not returned."
  );
}
