/**
 * Public catalog index for the agent-facing text surfaces (`llms.txt`,
 * `llms-full.txt`).
 *
 * These are the most payload-heavy surfaces in the product, so the query is kept
 * narrow in one gated place rather than in each route:
 *   - only the columns the documents render are read; `content` is read only for
 *     `llms-full.txt`, and only a granted body is attached;
 *   - the slice is bounded by the caller's normalized limit;
 *   - there is no `COUNT(*)` over the catalog. One extra row is read instead, so
 *     the document can say that it is truncated without scanning every listing.
 *
 * The gate decides per row: a protected listing comes back without its body and
 * the caller reports that, rather than rendering a blank that would read as an
 * empty skill. A listing the content scanner labelled `danger` never gets its body
 * attached, so `llms-full.txt` cannot hand an agent instructions flagged as unsafe.
 */

import { desc } from "drizzle-orm";
import { skills } from "~/lib/db/schema";
import type { Database } from "~/lib/db";
import { gateSkillRow } from "./protected-content";
import { summarizeRowRuntimes } from "~/lib/compatibility/catalog-compatibility";
import type { LlmsEntry } from "~/lib/markdown/llms-txt";

export interface PublicCatalogIndexOptions {
  /** Maximum number of listings to render. */
  limit: number;
  /** Attach the granted SKILL.md body (used by `llms-full.txt`). */
  includeContent?: boolean;
  userId?: string | null;
}

export interface PublicCatalogIndex {
  entries: LlmsEntry[];
  /** True when the catalog holds more listings than the slice. */
  truncated: boolean;
}

const INDEX_COLUMNS = {
  slug: skills.slug,
  name: skills.name,
  description: skills.description,
  author: skills.author,
  category: skills.category,
  is_paid: skills.is_paid,
  risk_label: skills.risk_label,
  compatibility_json: skills.compatibility_json,
};

export async function fetchPublicCatalogIndex(
  db: Database,
  options: PublicCatalogIndexOptions,
): Promise<PublicCatalogIndex> {
  const { limit, includeContent = false, userId = null } = options;
  const columns = includeContent ? { ...INDEX_COLUMNS, content: skills.content } : INDEX_COLUMNS;

  const rows = (await db
    .select(columns)
    .from(skills)
    .orderBy(desc(skills.composite_score))
    .limit(limit + 1)) as IndexRow[];

  const truncated = rows.length > limit;
  const entries: LlmsEntry[] = rows.slice(0, limit).map((row) => {
    const base: LlmsEntry = {
      slug: row.slug,
      name: row.name,
      description: row.description,
      author: row.author,
      category: row.category,
      riskLabel: row.risk_label ?? "unknown",
      compatibility: summarizeRowRuntimes(row),
    };
    // A `danger` listing never ships its body to an agent, granted or not.
    if (!includeContent || typeof row.content !== "string" || base.riskLabel === "danger") return base;
    const gated = gateSkillRow({ slug: row.slug, is_paid: row.is_paid, content: row.content }, userId);
    return typeof gated.content === "string" ? { ...base, content: gated.content } : base;
  });

  return { entries, truncated };
}

interface IndexRow {
  slug: string;
  name: string;
  description: string;
  author: string;
  category: string;
  is_paid: boolean | null;
  risk_label: string | null;
  compatibility_json: string | null;
  content?: string;
}
