import type { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills, ratings, reviews, favorites } from "~/lib/db/schema";
import { eq, desc, count, avg, and } from "drizzle-orm";
import { fetchSkillReferences } from "~/lib/db/skill-detail-queries";
import { getSession } from "~/lib/auth/session-helpers";
import { scanContent, sanitizeContent } from "~/lib/security/content-scanner";

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

    // Fetch skill data
    const [skill] = await db
      .select()
      .from(skills)
      .where(eq(skills.slug, slug))
      .limit(1);

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

    return Response.json({
      skill,
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
