/**
 * `GET /skills/:slug.md` — the Markdown variant of a skill page.
 *
 * Exists so an agent can read a skill in one request without parsing HTML. It is
 * a public route, so it runs through the same protected payload boundary as every
 * other surface: a protected listing is rendered without its SKILL.md body, not
 * with an empty one, so the omission is visible rather than misleading.
 *
 * Responds with a `Link` header naming the HTML canonical, which is what
 * `rel=alternate` on the HTML page reciprocates.
 */

import type { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { fetchSkillBySlug, fetchSkillReferences } from "~/lib/db/skill-detail-queries";
import { getSession } from "~/lib/auth/session-helpers";
import { parseStoredScripts } from "~/lib/catalog/skill-detail-data";
import { resolveSkillPayloadAccess } from "~/lib/catalog/protected-content";
import { summarizeRowRuntimes } from "~/lib/compatibility/catalog-compatibility";
import { renderSkillMarkdown, skillPageUrl } from "~/lib/markdown/skill-markdown";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const slug = params.slug;
  if (!slug) return new Response("Skill slug is required\n", { status: 400 });

  const env = context.cloudflare.env as Env;
  const db = getDb(env.DB);

  try {
    const siteUrl = new URL(request.url).origin;
    const skill = await fetchSkillBySlug(db, slug);
    if (!skill) return new Response("Skill not found\n", { status: 404 });

    const session = await getSession(request, env);
    const references = await fetchSkillReferences(db, skill.id);

    // The boundary decides; this route only renders the decision.
    const access = resolveSkillPayloadAccess(
      { slug: skill.slug, is_paid: skill.is_paid, content: skill.content },
      { userId: session?.user?.id ?? null },
    );

    const markdown = renderSkillMarkdown({
      siteUrl,
      skill,
      references: references.map((ref) => ({
        title: ref.title,
        url: ref.url,
        type: ref.type,
      })),
      scripts: parseStoredScripts(skill.scripts),
      compatibility: summarizeRowRuntimes(skill),
      payloadGranted: access.granted,
    });

    return new Response(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        Link: `<${skillPageUrl(siteUrl, skill.slug)}>; rel="canonical"`,
        Vary: "Cookie",
      },
    });
  } catch (error) {
    console.error("Skill markdown error:", error);
    return new Response("Failed to render skill\n", { status: 500 });
  }
}
