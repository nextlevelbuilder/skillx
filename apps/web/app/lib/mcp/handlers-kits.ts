/**
 * The `get_kit` MCP handler: a read of one personal kit's effective revision.
 *
 * Visibility follows the personal kit API and its parent rule
 * (`kit-verify.ts`), so MCP never shows more than that API would:
 *   - the owner (an unscoped API key or a web session) reads their own kit,
 *     private or public, with the effective revision's full document, as
 *     `GET /api/v1/kits/@h/n` would;
 *   - anyone else sees a kit only when it is public and its effective
 *     revision was authored public, reviewed and activated by its owner, and
 *     then only its metadata and revision digest, the same reference a foreign
 *     ancestor gets in `chainView` and the lock. The document stays with the
 *     owner. Everything else (unknown, private, never activated) is
 *     `not_found`, so a kit's existence is not revealed.
 *   - a kit whose publisher is suspended or revoked answers
 *     `publisher_revoked`, as `get_release` does for that publisher's packages.
 *
 * While `SKILLX_PERSONAL_KITS_API` is off the tool fails with
 * `feature_disabled` instead of pretending the kit does not exist, so an agent
 * can tell "turned off here" from "no such kit".
 */

import { ReleaseHttpError } from "~/lib/releases/release-http";
import { parseKitName, personalKitsApiEnabled } from "~/lib/personal-kits/kit-http";
import { documentOf, findKit, getRevision, revisionView } from "~/lib/personal-kits/kit-store";
import type { RevisionRow } from "~/lib/personal-kits/kit-store";
import { ToolCodedError, ToolInputError, asRecord } from "./protocol";
import { requiredString } from "./args";
import type { ToolContext } from "./handlers";

/** Read by the public: reviewed, activated, and authored public (the foreign-parent rule). */
const publiclyReadable = (row: RevisionRow) =>
  row.state === "reviewed" && row.activated_at !== null && documentOf(row).visibility === "public";

async function publisherActive(db: D1Database, publisherId: string): Promise<boolean> {
  const row = await db.prepare("SELECT state FROM publishers WHERE id = ?").bind(publisherId).first<{ state: string }>();
  return row?.state === "active";
}

/** `@handle/name`, validated by the kit API's own parser. */
function readKitName(args: Record<string, unknown>): string {
  const name = requiredString(args, "kit");
  const slash = name.indexOf("/");
  try {
    return parseKitName(slash < 0 ? name : name.slice(0, slash), slash < 0 ? undefined : name.slice(slash + 1));
  } catch (error) {
    if (error instanceof ReleaseHttpError) throw new ToolInputError(error.message);
    throw error;
  }
}

export async function getKit(rawArgs: unknown, ctx: ToolContext) {
  const name = readKitName(asRecord(rawArgs));
  if (!personalKitsApiEnabled(ctx.env as { SKILLX_PERSONAL_KITS_API?: string })) {
    throw new ToolCodedError(
      "feature_disabled",
      "Personal kits are not enabled on this server (SKILLX_PERSONAL_KITS_API is off).",
    );
  }

  const notFound = { found: false, code: "not_found", kit: name };
  const kit = await findKit(ctx.env.DB, name);
  if (kit === null) return notFound;

  const owner = typeof ctx.userId === "string" && kit.owner_user_id === ctx.userId;
  if (!owner && kit.visibility !== "public") return notFound;

  const effective = kit.effective_revision_id === null ? null : await getRevision(ctx.env.DB, kit.id, kit.effective_revision_id);
  if (!owner && (effective === null || !publiclyReadable(effective))) return notFound;
  if (!(await publisherActive(ctx.env.DB, kit.publisher_id))) return { found: false, code: "publisher_revoked", kit: name };

  return {
    found: true,
    viewer: owner ? "owner" : "public",
    kit: {
      kit: kit.name,
      visibility: kit.visibility,
      // Owner-only bookkeeping stays with the owner.
      ...(owner ? { localId: kit.local_id, generation: Number(kit.generation) } : {}),
    },
    effectiveRevision:
      effective === null
        ? null
        : owner
          ? revisionView(effective, true)
          : { digest: effective.revision_digest, number: Number(effective.revision_number), activatedAt: revisionView(effective).activatedAt },
  };
}
