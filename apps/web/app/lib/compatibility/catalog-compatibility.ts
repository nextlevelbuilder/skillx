/**
 * Listing-level compatibility adapter.
 *
 * A `skills` row is a mutable listing, so its declaration can reach `declared`
 * but never `verified` — there is no artifact digest to bind evidence to. The
 * precedence between a release declaration and a listing declaration is owned by
 * `selectDeclaration` in `@skillx/contracts`; this module only loads the row and
 * delegates, so web, CLI, MCP, and Markdown cannot drift apart.
 *
 * Release-backed declarations and evidence are read in Phase 2, when a listing
 * can be linked to an immutable release. Until then `hasRelease` is always false
 * and no evidence is passed, which is why every undeclared row is `unknown`.
 */

import {
  resolveCatalogCompatibility,
  isCompatibilityActionable,
  toCompatibilitySummary,
  type CatalogCompatibilityInputs,
  type CompatibilitySummary,
  type CompatibilityTarget,
  type NormalizedCompatibility,
} from "@skillx/contracts";
import { parseDeclaration } from "./compatibility-service";

/** The compatibility inputs available on a mutable catalog listing. */
export interface ListingCompatibilityRow {
  compatibility_json?: string | null;
}

/**
 * Compatibility inputs for a listing, or `{}` when it declares nothing.
 *
 * Malformed JSON resolves to `undefined`, which the engine reports as `unknown`:
 * a row that cannot be parsed must never be presented as supporting a runtime.
 */
export function listingInputs(row: ListingCompatibilityRow): CatalogCompatibilityInputs {
  const declaration = parseDeclaration(row.compatibility_json);
  return declaration ? { listingDeclaration: declaration } : {};
}

/** Resolves one target against a listing row. */
export function resolveRowCompatibility(
  row: ListingCompatibilityRow,
  target: CompatibilityTarget,
): NormalizedCompatibility {
  return resolveCatalogCompatibility(target, listingInputs(row));
}

/**
 * Every runtime the listing declares, as compact summaries.
 *
 * When `target` names one of the declared runtimes, that runtime is resolved with
 * the target's version so a version mismatch surfaces as `blocked` instead of a
 * bare `declared`.
 */
export function summarizeRowRuntimes(
  row: ListingCompatibilityRow,
  target?: CompatibilityTarget,
): CompatibilitySummary[] {
  const inputs = listingInputs(row);
  return Object.keys(inputs.listingDeclaration ?? {}).map((runtime) => {
    const effective: CompatibilityTarget =
      target && target.runtime === runtime ? target : { runtime };
    return toCompatibilitySummary(resolveCatalogCompatibility(effective, inputs));
  });
}

/** Summary for one target, or `null` when the listing declares nothing at all. */
export function summarizeRowRuntime(
  row: ListingCompatibilityRow,
  target: CompatibilityTarget,
): CompatibilitySummary | null {
  const declared = Object.keys(parseDeclaration(row.compatibility_json) ?? {});
  if (!declared.includes(target.runtime)) return null;
  return toCompatibilitySummary(resolveRowCompatibility(row, target));
}

/**
 * Parses `runtime` or `runtime@version` from a query parameter.
 *
 * Unlike the search filter, the detail surface evaluates the version, so this
 * keeps it. A version-aware answer for one package belongs to `check`/`inspect`
 * rather than to a catalog-wide search filter.
 */
export function parseCompatibilityTarget(value: string | null | undefined): CompatibilityTarget | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const [runtime, version] = trimmed.split("@");
  if (!runtime) return null;
  return version ? { runtime, version } : { runtime };
}

/**
 * True when this listing may be acted on for the requested target.
 *
 * Only `declared` and `verified` count. `unknown` is absence of a claim, not a
 * claim of support, so an agent filtering on this never installs something that
 * a publisher never said would run.
 */
export function listingMatchesTarget(row: ListingCompatibilityRow, target: CompatibilityTarget): boolean {
  const summary = summarizeRowRuntime(row, target);
  return summary !== null && isCompatibilityActionable(summary.status);
}
