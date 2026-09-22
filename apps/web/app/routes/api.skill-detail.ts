import type { LoaderFunctionArgs } from "react-router";
import { requestSearchParams } from "~/lib/http/request-params";
import { getDb } from "~/lib/db";
import { skills, ratings, reviews, favorites } from "~/lib/db/schema";
import { eq, desc, count, avg, and } from "drizzle-orm";
import { fetchSkillReferences } from "~/lib/db/skill-detail-queries";
import { findSkillBySource, findSkillsByLeaf, resolveSkillBySlug } from "~/lib/db/skill-aliases";
import { GITHUB_REPO_PATTERN } from "~/lib/skills/registration";
import { getSession } from "~/lib/auth/session-helpers";
import { scanContent, sanitizeContent } from "~/lib/security/content-scanner";
import { omitPayload, resolveSkillPayloadAccess } from "~/lib/catalog/protected-content";

/** Detect stub content: short + ends with "## Author\n{author}" */
function isStubContent(content: string, author: string): boolean {
  return content.length < 300 && content.trimEnd().endsWith(`## Author\n${author}`);
}

/** Derive raw SKILL.md URL from a GitHub source_url like
 *  https://github.com/{owner}/{repo}/tree/{branch}/{path} */
function toRawSkillMdUrl(sourceUrl: string): string | null {
  const m = sourceUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.*)/);
  if (!m) return null;
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}/SKILL.md`;
}

/** Fetch real SKILL.md content from GitHub. Returns null on failure. */
async function fetchRealContent(sourceUrl: string): Promise<string | null> {
  const rawUrl = toRawSkillMdUrl(sourceUrl);
  if (!rawUrl) return null;

  try {
    const res = await fetch(rawUrl, {
      headers: { "User-Agent": "SkillX/1.0" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim().length > 20 ? text : null;
  } catch {
    return null;
  }
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  try {
    const slug = params.slug;
    if (!slug) {
      return Response.json({ error: "Skill slug is required" }, { status: 400 });
    }

    const env = context.cloudflare.env as Env;
    const db = getDb(env.DB);

    // `repo` (+ optional `path`) pins the lookup to a source identity: the only unambiguous way
    // to name a skill whose folder name is shared inside one repository. When it is present, a miss
    // never falls back to a slug that may belong to another skill.
    const search = requestSearchParams(request);
    const repo = search.get("repo");
    const repoPath = search.get("path") ?? "";

    const pinnedRepo = repo && GITHUB_REPO_PATTERN.test(repo) ? repo.toLowerCase() : null;

    let skill = pinnedRepo
      ? await findSkillBySource(db, pinnedRepo, repoPath)
      : await resolveSkillBySlug(db, slug);

    // `owner/repo/leaf` is the documented short form for a skill whose stored path is deeper than
    // the folder the caller typed. A unique leaf inside the named repo is used, so the short form
    // keeps working; an ambiguous one is refused with its candidates instead of guessed.
    if (!skill && pinnedRepo) {
      const candidates = await findSkillsByLeaf(db, pinnedRepo, repoPath);
      if (candidates.length === 1) {
        skill = await findSkillBySource(db, pinnedRepo, candidates[0].source_path ?? "");
      } else if (candidates.length > 1) {
        return Response.json(
          {
            error: "Ambiguous skill path",
            candidates: candidates.map((candidate) => ({
              slug: candidate.slug,
              source_path: candidate.source_path,
            })),
          },
          { status: 404 },
        );
      }
    }

    if (!skill) {
      return Response.json({ error: "Skill not found" }, { status: 404 });
    }

    // Lazy content fetch: if DB has stub content, pull real SKILL.md from GitHub
    if (skill.source_url && isStubContent(skill.content, skill.author)) {
      const realContent = await fetchRealContent(skill.source_url);
      if (realContent) {
        const cleanContent = sanitizeContent(realContent);
        const scanResult = scanContent(cleanContent);
        skill.content = cleanContent;
        skill.risk_label = scanResult.label;
        // Persist to DB so future requests are fast (fire-and-forget)
        db.update(skills)
          .set({ content: cleanContent, risk_label: scanResult.label, updated_at: new Date() })
          .where(eq(skills.id, skill.id))
          .execute()
          .catch(() => {});
      }
    }

    // Fetch references (metadata only) — shared query
    const refs = await fetchSkillReferences(db, skill.id);

    // Parse scripts JSON
    let parsedScripts: Array<{ name: string; command: string; url: string }> = [];
    if (skill.scripts) {
      try { parsedScripts = JSON.parse(skill.scripts); } catch (e) {
        console.warn(`Invalid scripts JSON for ${slug}:`, e instanceof Error ? e.message : e);
      }
    }

    // Fetch reviews with limit
    const skillReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.skill_id, skill.id))
      .orderBy(desc(reviews.created_at))
      .limit(50);

    // Calculate rating summary
    const ratingData = await db
      .select({
        avgRating: avg(ratings.score),
        ratingCount: count(ratings.id),
      })
      .from(ratings)
      .where(eq(ratings.skill_id, skill.id))
      .get();

    // Check if current user has favorited (if authenticated)
    let isFavorited = false;
    const session = await getSession(request, env);
    if (session?.user?.id) {
      const [favorite] = await db
        .select()
        .from(favorites)
        .where(and(eq(favorites.user_id, session.user.id), eq(favorites.skill_id, skill.id)))
        .limit(1);
      isFavorited = !!favorite;
    }

    // Protected payload boundary: `skills.content` is never forwarded directly.
    // The resolver grants it for public/free listings and denies it for
    // protected listings, so every existing consumer keeps working.
    const access = resolveSkillPayloadAccess(
      { slug: skill.slug, is_paid: skill.is_paid, content: skill.content },
      { userId: session?.user?.id ?? null },
    );
    const skillMetadata = omitPayload(skill);
    const skillView = access.granted ? { ...skillMetadata, content: access.payload } : skillMetadata;

    return Response.json({
      skill: skillView,
      reviews: skillReviews,
      isFavorited,
      ratingSummary: {
        avgRating: ratingData?.avgRating || 0,
        ratingCount: ratingData?.ratingCount || 0,
      },
      references: refs,
      scripts: parsedScripts,
    });
  } catch (error) {
    console.error("Error fetching skill detail:", error);
    return Response.json(
      { error: "Failed to fetch skill details" },
      { status: 500 }
    );
  }
}
