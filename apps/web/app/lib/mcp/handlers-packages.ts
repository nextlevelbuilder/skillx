/**
 * Package-facing MCP handlers: search, detail, releases, and compatibility.
 *
 * These are thin adapters over the same executors the HTTP API and the CLI use,
 * not a second implementation. Where a tool cannot answer — the registry tables
 * are empty until a later phase populates releases — it returns `found: false`
 * with a reason code instead of throwing or inventing a value. "Not in the
 * registry" and "the call failed" are different answers an agent must be able to
 * tell apart.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "~/lib/db";
import { skills } from "~/lib/db/schema";
import { packages, packageReleases } from "~/lib/db/registry-schema";
import { fetchSkillReferences } from "~/lib/db/skill-detail-queries";
import { executeSearch } from "~/lib/search/search-executor";
import { parseCompatibilityFilter } from "~/lib/search/compatibility-filter";
import { toPublicSkillDetail } from "~/lib/catalog/public-dto";
import { buildSkillDetailResponse, isProtectedListing } from "~/lib/catalog/protected-content";
import {
  parseCompatibilityTarget,
  resolveRowCompatibility,
  summarizeRowRuntimes,
} from "~/lib/compatibility/catalog-compatibility";
import { ToolInputError, asRecord } from "./protocol";
import { optionalLimit, optionalString, requiredString } from "./args";
import type { ToolContext } from "./handlers";

/** Same executor, same projection, same filter report as `POST /api/search`. */
export async function searchPackages(rawArgs: unknown, ctx: ToolContext) {
  const args = asRecord(rawArgs);
  const query = requiredString(args, "query");
  const compatible = optionalString(args, "compatible");
  const category = optionalString(args, "category");

  const outcome = await executeSearch(ctx.env, {
    query,
    filters: category ? { category } : {},
    userId: ctx.userId ?? undefined,
    limit: optionalLimit(args, 20, 100),
    compatible: parseCompatibilityFilter(compatible) ?? undefined,
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

export async function getPackage(rawArgs: unknown, ctx: ToolContext) {
  const args = asRecord(rawArgs);
  const slug = requiredString(args, "slug");
  const db = getDb(ctx.env.DB);

  const [row] = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1);
  if (!row) return { found: false, code: "not_found", slug };

  const references = await fetchSkillReferences(db, row.id);
  const detail = toPublicSkillDetail(row, references, [], row.scripts);
  // The boundary decides whether `content` is part of the answer.
  const gated = buildSkillDetailResponse(
    detail,
    { slug: row.slug, is_paid: row.is_paid, content: row.content },
    { userId: ctx.userId ?? null },
  );

  const target = parseCompatibilityTarget(optionalString(args, "target"));
  return {
    found: true,
    package: {
      ...gated,
      protected: isProtectedListing(row),
      contentIncluded: typeof (gated as { content?: string }).content === "string",
    },
    compatibility: {
      declared: summarizeRowRuntimes(row),
      ...(target ? { target: resolveRowCompatibility(row, target) } : {}),
    },
  };
}

export async function getRelease(rawArgs: unknown, ctx: ToolContext) {
  const args = asRecord(rawArgs);
  const packageSlug = requiredString(args, "package");
  const version = optionalString(args, "version");
  const db = getDb(ctx.env.DB);

  const [pkg] = await db.select().from(packages).where(eq(packages.slug, packageSlug)).limit(1);
  if (!pkg) return { found: false, code: "no_package", package: packageSlug };

  const rows = await db
    .select()
    .from(packageReleases)
    .where(
      version
        ? and(eq(packageReleases.package_id, pkg.id), eq(packageReleases.version, version))
        : eq(packageReleases.package_id, pkg.id),
    )
    .orderBy(desc(packageReleases.created_at))
    .limit(version ? 1 : 20);

  if (rows.length === 0) {
    return version
      ? { found: false, code: "unknown_version", package: packageSlug, version }
      : { found: false, code: "no_releases", package: packageSlug };
  }

  const releases = rows.map((release) => ({
    version: release.version,
    channel: release.channel,
    releaseState: release.release_state,
    manifestSchemaVersion: release.manifest_schema_version,
    artifactDigest: release.artifact_digest,
    artifactSize: release.artifact_size,
    publishedAt: release.published_at,
    yankedAt: release.yanked_at,
    compatibility: release.compatibility_json,
  }));

  return version
    ? { found: true, package: packageSlug, release: releases[0] }
    : { found: true, package: packageSlug, releases };
}

/** Version-aware, and it reads the listing declaration rather than a search index. */
export async function checkCompatibility(rawArgs: unknown, ctx: ToolContext) {
  const args = asRecord(rawArgs);
  const slug = requiredString(args, "slug");
  const target = parseCompatibilityTarget(requiredString(args, "target"));
  if (!target) {
    throw new ToolInputError("target must look like `runtime` or `runtime@version`");
  }

  const db = getDb(ctx.env.DB);
  const [row] = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1);
  if (!row) return { found: false, code: "not_found", slug };

  const result = resolveRowCompatibility(row, target);
  return { found: true, slug, target, ...result };
}
