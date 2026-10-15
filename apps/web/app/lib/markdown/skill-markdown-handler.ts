/**
 * `GET /skills/<slug>.md` — the Markdown variant of a skill page.
 *
 * Exists so an agent can read a skill in one request without parsing HTML. It
 * runs through the same protected payload boundary as every other surface: a
 * protected listing is rendered without its SKILL.md body, not with an empty one,
 * so the omission is visible rather than misleading.
 *
 * The document is strictly public. It never reads a session, so the response is
 * the same for every caller and can be cached publicly without a `Vary: Cookie`
 * that would split (or, behind a cache that ignores `Vary`, leak) per-viewer
 * copies. A viewer-specific body belongs to the authenticated detail API.
 *
 * Dispatched from the worker entry rather than a React Router route: a partial
 * dynamic segment such as `:slug.md` is not a supported route pattern, so the
 * path is matched explicitly by `matchSkillMarkdownPath`.
 *
 * Responds with a `Link` header naming the HTML canonical, which is what
 * `rel=alternate` on the HTML page reciprocates.
 */

import { getDb } from "~/lib/db";
import { fetchSkillBySlug, fetchSkillReferences } from "~/lib/db/skill-detail-queries";
import { parseStoredScripts } from "~/lib/catalog/skill-detail-data";
import { resolveSkillPayloadAccess } from "~/lib/catalog/protected-content";
import { summarizeRowRuntimes } from "~/lib/compatibility/catalog-compatibility";
import { renderSkillMarkdown, skillPageUrl } from "./skill-markdown";

const SKILL_MARKDOWN_PATH = /^\/skills\/([^/]+)\.md$/;

/**
 * The slug addressed by a `/skills/<slug>.md` path, or `null` for any other path.
 * A slug that is not valid percent-encoding is `null` too, so it falls through to
 * the ordinary 404 instead of throwing.
 */
export function matchSkillMarkdownPath(pathname: string): string | null {
  const match = SKILL_MARKDOWN_PATH.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

const TEXT_HEADERS = { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" };

export async function handleSkillMarkdown(request: Request, env: Env, slug: string): Promise<Response> {
  if (!slug) return new Response("Skill slug is required\n", { status: 400, headers: TEXT_HEADERS });

  const db = getDb(env.DB);
  try {
    const siteUrl = new URL(request.url).origin;
    const skill = await fetchSkillBySlug(db, slug);
    if (!skill) return new Response("Skill not found\n", { status: 404, headers: TEXT_HEADERS });

    const references = await fetchSkillReferences(db, skill.id);

    // The boundary decides; this handler only renders the decision. The viewer is
    // always anonymous, which is what makes the public cache below correct.
    const access = resolveSkillPayloadAccess(
      { slug: skill.slug, is_paid: skill.is_paid, content: skill.content },
      { userId: null },
    );

    const markdown = renderSkillMarkdown({
      siteUrl,
      skill,
      references: references.map((ref) => ({ title: ref.title, url: ref.url, type: ref.type })),
      scripts: parseStoredScripts(skill.scripts),
      compatibility: summarizeRowRuntimes(skill),
      payloadGranted: access.granted,
    });

    return new Response(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
        Link: `<${skillPageUrl(siteUrl, skill.slug)}>; rel="canonical"`,
      },
    });
  } catch (error) {
    console.error("Skill markdown error:", error);
    return new Response("Failed to render skill\n", { status: 500, headers: TEXT_HEADERS });
  }
}
