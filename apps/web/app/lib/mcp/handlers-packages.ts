/**
 * Listing-facing MCP handlers: search, detail, and compatibility.
 *
 * These are thin adapters over the same executors the HTTP API and the CLI use,
 * not a second implementation. Slugs resolve through `fetchSkillBySlug`, so a
 * legacy slug kept in `skill_aliases` answers here exactly as it does on the web
 * page and the detail API. A miss returns `found: false` with a reason code
 * instead of throwing: "not in the catalog" and "the call failed" are different
 * answers an agent must be able to tell apart.
 */

import { getDb } from "~/lib/db";
import { fetchSkillBySlug, fetchSkillReferences } from "~/lib/db/skill-detail-queries";
import { executeSearch } from "~/lib/search/search-executor";
import { parseCompatibilityFilter } from "~/lib/search/compatibility-filter";
import { toPublicSkillDetail } from "~/lib/catalog/public-dto";
import { buildSkillDetailResponse, isProtectedListing } from "~/lib/catalog/protected-content";
import {
  parseCompatibilityTarget,
  resolveRowCompatibility,
  summarizeRowRuntimes,
} from "~/lib/compatibility/catalog-compatibility";
import { DANGER_BODY_NOTICE, isDangerListing } from "~/lib/markdown/listing-text";
import { ToolInputError, asRecord } from "./protocol";
import { optionalLimit, optionalString, requiredString } from "./args";
import type { ToolContext } from "./handlers";

const TARGET_MESSAGE = "target must be a runtime id, optionally runtime@version";

/** Same executor, same projection, same filter report as `POST /api/search`. */
export async function searchPackages(rawArgs: unknown, ctx: ToolContext) {
  const args = asRecord(rawArgs);
  const query = requiredString(args, "query");
  const compatible = parseCompatibilityFilter(args.compatible);
  if (!compatible.ok) throw new ToolInputError(compatible.error);
  const category = optionalString(args, "category");

  const outcome = await executeSearch(ctx.env, {
    query,
    filters: category ? { category } : {},
    userId: ctx.userId ?? undefined,
    limit: optionalLimit(args, 20, 100),
    ...(compatible.filter ? { compatible: compatible.filter } : {}),
  });

  // The filter report and note travel with the result: a filter that hides
  // undecidable listings silently would make the catalog look smaller.
  return {
    results: outcome.results,
    count: outcome.results.length,
    ...(outcome.compatibilityFilter ? { compatibilityFilter: outcome.compatibilityFilter } : {}),
    ...(outcome.note ? { note: outcome.note } : {}),
  };
}

/** A `danger` listing keeps its metadata but never returns its SKILL.md body. */
export function applyDangerPolicy<T extends { contentIncluded: boolean }>(
  pkg: T,
  riskLabel: string | null | undefined,
): T & { contentOmitted?: string } {
  if (!isDangerListing(riskLabel)) return pkg;
  const { content: _content, ...rest } = pkg as T & { content?: string };
  return { ...(rest as T), contentIncluded: false, contentOmitted: DANGER_BODY_NOTICE };
}

export async function getPackage(rawArgs: unknown, ctx: ToolContext) {
  const args = asRecord(rawArgs);
  const slug = requiredString(args, "slug");
  // Validated before any read, so a bad target never costs a query.
  const rawTarget = optionalString(args, "target");
  const target = parseCompatibilityTarget(rawTarget);
  if (rawTarget !== undefined && !target) throw new ToolInputError(TARGET_MESSAGE);

  const db = getDb(ctx.env.DB);
  const row = await fetchSkillBySlug(db, slug);
  if (!row) return { found: false, code: "not_found" };

  const references = await fetchSkillReferences(db, row.id);
  const detail = toPublicSkillDetail(row, references, [], row.scripts);
  // The boundary decides whether `content` is part of the answer.
  const gated = buildSkillDetailResponse(
    detail,
    { slug: row.slug, is_paid: row.is_paid, content: row.content },
    { userId: ctx.userId ?? null },
  );
  return {
    found: true,
    package: applyDangerPolicy(
      {
        ...gated,
        protected: isProtectedListing(row),
        contentIncluded: typeof (gated as { content?: string }).content === "string",
      },
      row.risk_label,
    ),
    compatibility: {
      declared: summarizeRowRuntimes(row),
      ...(target ? { target: resolveRowCompatibility(row, target) } : {}),
    },
  };
}

/** Version-aware, and it reads the listing declaration rather than a search index. */
export async function checkCompatibility(rawArgs: unknown, ctx: ToolContext) {
  const args = asRecord(rawArgs);
  const slug = requiredString(args, "slug");
  const target = parseCompatibilityTarget(requiredString(args, "target"));
  if (!target) {
    throw new ToolInputError(TARGET_MESSAGE);
  }

  const db = getDb(ctx.env.DB);
  const row = await fetchSkillBySlug(db, slug);
  if (!row) return { found: false, code: "not_found" };

  const result = resolveRowCompatibility(row, target);
  // `slug` is the canonical slug, so an alias lookup tells the caller the current name.
  return { found: true, slug: row.slug, target, ...result };
}
