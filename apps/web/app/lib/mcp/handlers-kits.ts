/**
 * Kit (collection) handler.
 *
 * A kit is a published collection revision. Only `public` visibility is
 * readable: a private collection answers `not_found`, exactly like one that does
 * not exist, so the tool cannot be used to enumerate private slugs. That is a
 * deliberate choice to make the two cases indistinguishable from outside.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "~/lib/db";
import { collections, collectionRevisions } from "~/lib/db/collections-schema";
import { asRecord } from "./protocol";
import { parseMembers, requiredString } from "./args";
import type { ToolContext } from "./handlers";

export async function getKit(rawArgs: unknown, ctx: ToolContext) {
  const args = asRecord(rawArgs);
  const slug = requiredString(args, "slug");
  const db = getDb(ctx.env.DB);

  const [collection] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.slug, slug), eq(collections.visibility, "public")))
    .limit(1);
  if (!collection) return { found: false, code: "not_found", slug };

  const revisions = await db
    .select()
    .from(collectionRevisions)
    .where(eq(collectionRevisions.collection_id, collection.id))
    .orderBy(desc(collectionRevisions.revision_number))
    .limit(1);

  const latest = revisions[0];
  return {
    found: true,
    kit: {
      slug: collection.slug,
      name: collection.name,
      ownerId: collection.owner_id,
      visibility: collection.visibility,
      latestRevisionNumber: collection.latest_revision_number,
      updatedAt: collection.updated_at,
      ...(latest ? { ...parseMembers(latest.members_json), config: latest.config_json } : {}),
    },
  };
}
