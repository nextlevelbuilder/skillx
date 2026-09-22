import type { ActionFunctionArgs } from "react-router";
import { and, eq } from "drizzle-orm";
import { pickSlug, sourceIdentity } from "@skillx/skill-identity";
import { getDb } from '~/lib/db';
import { skills } from '~/lib/db/schema';
import { recordSkillAlias } from '~/lib/db/skill-aliases';
import { skillReferences } from '~/lib/db/skill-references-schema';
import { indexSkill } from '~/lib/vectorize/index-skill';
import { indexReference } from '~/lib/vectorize/index-reference';
import { sanitizeContent } from '~/lib/security/content-scanner';

const GITHUB_URL_PATTERN = /^https:\/\/(raw\.githubusercontent\.com|github\.com)\//;

interface ReferenceInput {
  title: string;
  filename: string;
  url?: string;
  type?: string;
  content: string;
}

interface SkillInput {
  name: string;
  slug: string;
  description: string;
  content: string;
  author: string;
  source_url?: string;
  category: string;
  install_command?: string;
  version?: string;
  is_paid?: boolean;
  price_cents?: number;
  avg_rating?: number;
  rating_count?: number;
  github_stars?: number;
  install_count?: number;
  scripts?: string; // JSON string
  references?: ReferenceInput[];
}

export async function action({ request, context }: ActionFunctionArgs) {
  // Verify admin secret
  const adminSecret = request.headers.get('X-Admin-Secret');
  const env = context.cloudflare.env;

  if (!adminSecret || adminSecret !== env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Parse request body
    const skillsData: SkillInput[] = await request.json();

    if (!Array.isArray(skillsData)) {
      return Response.json({ error: 'Request body must be an array of skills' }, { status: 400 });
    }

    const db = getDb(env.DB);
    let skillCount = 0;
    let vectorCount = 0;

    // Process each skill
    for (const skillData of skillsData) {
      const skillId = crypto.randomUUID();
      const now = new Date();

      // Upsert skill into D1
      // Identity comes from the source, never from the display name: two skills that share a
      // folder name inside one repository stay two rows, and re-seeding updates the row that
      // already holds this identity instead of inserting a duplicate.
      const identity = sourceIdentity({
        sourceUrl: skillData.source_url,
        author: skillData.author,
        name: skillData.name,
        slug: skillData.slug,
      });
      const identityRepo = identity.sourced ? identity.repoLabel : null;
      const identityPath = identity.sourced ? identity.path : null;

      const [rowByIdentity] = identityRepo
        ? await db
            .select({ id: skills.id, slug: skills.slug })
            .from(skills)
            .where(
              and(eq(skills.source_repo, identityRepo), eq(skills.source_path, identityPath ?? '')),
            )
            .limit(1)
        : [];

      // Rows seeded before identities existed only carry source_url; matching on it lets a
      // re-seed upgrade them in place instead of creating a second row for the same skill.
      const [rowBySourceUrl] = skillData.source_url
        ? await db
            .select({ id: skills.id, slug: skills.slug })
            .from(skills)
            .where(eq(skills.source_url, skillData.source_url))
            .limit(1)
        : [];

      // A slug-only match is the last resort, and it is only safe while that row still has no
      // identity: once a row owns an identity its slug belongs to that skill, and rewriting the row
      // here would quietly destroy the other skill's identity.
      const [rowBySlug] = await db
        .select({ id: skills.id, slug: skills.slug, source_repo: skills.source_repo })
        .from(skills)
        .where(eq(skills.slug, skillData.slug))
        .limit(1);

      const renamableBySlug = rowBySlug && rowBySlug.source_repo === null ? rowBySlug : undefined;
      const target = rowByIdentity ?? rowBySourceUrl ?? renamableBySlug;
      const actualSkillId = target?.id || skillId;

      // The requested slug can also be held by a different skill. This is then a new skill that
      // needs its own slug: the identity fragment keeps both reachable instead of failing the whole
      // seed run on the unique constraint.
      const finalSlug =
        rowBySlug && !renamableBySlug
          ? pickSlug(skillData.slug, identity.identity, new Set([rowBySlug.slug]))
          : skillData.slug;

      await db
        .insert(skills)
        .values({
          id: actualSkillId,
          name: skillData.name,
          slug: finalSlug,
          description: skillData.description,
          content: skillData.content,
          author: skillData.author,
          source_url: skillData.source_url || null,
          source_repo: identityRepo,
          source_path: identityPath,
          category: skillData.category,
          install_command: skillData.install_command || null,
          version: skillData.version || '1.0.0',
          is_paid: skillData.is_paid || false,
          price_cents: skillData.price_cents || 0,
          avg_rating: skillData.avg_rating || 0,
          rating_count: skillData.rating_count || 0,
          github_stars: skillData.github_stars || 0,
          install_count: skillData.install_count || 0,
          scripts: skillData.scripts || null,
          created_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: skills.id,
          set: {
            name: skillData.name,
            slug: finalSlug,
            description: skillData.description,
            content: skillData.content,
            author: skillData.author,
            source_url: skillData.source_url || null,
            source_repo: identityRepo,
            source_path: identityPath,
            category: skillData.category,
            install_command: skillData.install_command || null,
            version: skillData.version || '1.0.0',
            is_paid: skillData.is_paid || false,
            price_cents: skillData.price_cents || 0,
            avg_rating: skillData.avg_rating || 0,
            rating_count: skillData.rating_count || 0,
            github_stars: skillData.github_stars || 0,
            install_count: skillData.install_count || 0,
            scripts: skillData.scripts || null,
            updated_at: now,
          },
        });

      // A slug that changed must stay reachable: keep the previous one as an alias.
      if (target && target.slug !== finalSlug) {
        await recordSkillAlias(db, {
          slug: target.slug,
          skillId: actualSkillId,
          reason: 'renamed',
          createdAt: now,
        });
      }

      // Upsert references
      if (skillData.references?.length) {
        for (const ref of skillData.references) {
          const validUrl = ref.url && GITHUB_URL_PATTERN.test(ref.url) ? ref.url : null;
          // Sanitize reference content (strip zero-width Unicode, ANSI escapes)
          const cleanContent = sanitizeContent(ref.content);
          await db.insert(skillReferences).values({
            id: crypto.randomUUID(),
            skill_id: actualSkillId,
            title: ref.title,
            filename: ref.filename,
            url: validUrl,
            type: ref.type || 'docs',
            content: cleanContent,
            created_at: now,
          }).onConflictDoUpdate({
            target: [skillReferences.skill_id, skillReferences.filename],
            set: { content: cleanContent, url: validUrl, title: ref.title, type: ref.type || 'docs' },
          });
        }
        // Populate fts_content (content + ref titles for FTS5)
        const refTitles = skillData.references.map(r => r.title).join(' ');
        await db.update(skills)
          .set({ fts_content: `${skillData.content}\n\n${refTitles}` })
          .where(eq(skills.slug, finalSlug));
      }

      skillCount++;

      // Index skill in Vectorize (skip via ?skip_vectors=true or if unavailable)
      const skipVectors = new URL(request.url).searchParams.get('skip_vectors') === 'true';
      if (!skipVectors) {
        try {
          const vectors = await indexSkill(env.VECTORIZE, env.AI, {
            id: skillId,
            name: skillData.name,
            description: skillData.description,
            content: skillData.content,
            category: skillData.category,
            is_paid: skillData.is_paid || false,
            avg_rating: skillData.avg_rating || 0,
          });
          vectorCount += vectors;
        } catch (vecError) {
          console.warn(`Vectorize skipped for ${skillData.slug}:`, vecError instanceof Error ? vecError.message : vecError);
        }

        // Index references in Vectorize
        if (skillData.references?.length) {
          for (const ref of skillData.references) {
            try {
              vectorCount += await indexReference(env.VECTORIZE, env.AI, {
                skill_id: actualSkillId,
                filename: ref.filename,
                content: ref.content,
                category: skillData.category,
                is_paid: skillData.is_paid || false,
                avg_rating: skillData.avg_rating || 0,
              });
            } catch (e) {
              console.warn(`Vectorize ref skipped: ${ref.filename}`, e instanceof Error ? e.message : e);
            }
          }
        }
      }
    }

    return Response.json({
      skills: skillCount,
      vectors: vectorCount,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return Response.json(
      { error: 'Failed to seed skills', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
