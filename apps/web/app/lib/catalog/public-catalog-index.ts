/**
 * Public catalog index for the agent-facing text surfaces (`llms.txt`,
 * `llms-full.txt`).
 *
 * These are the most payload-heavy surfaces in the product, so they read full
 * `skills` rows here — in one gated place — rather than in each route. The gate
 * decides per row: a protected listing comes back without its body and the
 * caller reports that, rather than rendering a blank that would read as an empty
 * skill.
 *
 * The total is counted separately from the slice. A truncated document that
 * reports the size of its own slice tells an agent the catalog ends there.
 */

import { count, desc } from "drizzle-orm";
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
  /** Total listings in the catalog, not the size of the slice. */
  total: number;
}

export async function fetchPublicCatalogIndex(
  db: Database,
  options: PublicCatalogIndexOptions,
): Promise<PublicCatalogIndex> {
  const { limit, includeContent = false, userId = null } = options;

  const [rows, totals] = await Promise.all([
    db.select().from(skills).orderBy(desc(skills.composite_score)).limit(limit),
    db.select({ value: count() }).from(skills),
  ]);

  const entries: LlmsEntry[] = rows.map((row) => {
    const gated = gateSkillRow(row, userId);
    return {
      slug: gated.slug,
      name: gated.name,
      description: gated.description,
      author: gated.author,
      category: gated.category,
      compatibility: summarizeRowRuntimes(gated),
      ...(includeContent && typeof gated.content === "string" ? { content: gated.content } : {}),
    };
  });

  return { entries, total: totals[0]?.value ?? entries.length };
}
