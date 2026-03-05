import type { Route } from "./+types/home";
import { CommandBox } from "../components/command-box";
import { SkillCard } from "../components/skill-card";
import { HomeLeaderboard } from "../components/home-leaderboard";
import { getDb } from "~/lib/db";
import { skills } from "~/lib/db/schema";
import { desc, count, sql } from "drizzle-orm";
import { getCached } from "~/lib/cache/kv-cache";
import { getSession } from "~/lib/auth/session-helpers";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "SkillX.sh — The Only Skill That Your AI Agent Needs" },
    {
      name: "description",
      content:
        "AI agent skills marketplace with semantic search, leaderboard, ratings, and CLI.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);

  // Check auth state (non-blocking)
  const session = await getSession(request, env).catch(() => null);
  const isAuthenticated = !!session?.user;

  // Get global stats with KV cache (5 min TTL)
  const stats = await getCached(env.KV, "stats:global", 300, async () => {
    const [skillCount] = await db.select({ count: count() }).from(skills);
    const [installSum] = await db
      .select({ total: sql<number>`coalesce(sum(install_count), 0)` })
      .from(skills);

    return {
      skillCount: skillCount?.count || 0,
      installCount: installSum?.total || 0,
    };
  });

  // Get featured skills (top 6 by composite score)
  const featuredSkills = await db
    .select()
    .from(skills)
    .orderBy(desc(skills.composite_score))
    .limit(6);

  // Get first page of leaderboard sorted by composite score
  const PAGE_SIZE = 20;
  // Distinct categories for filter dropdown
  const categories = await getCached(env.KV, "categories:distinct", 300, async () => {
    const rows = await db
      .selectDistinct({ category: skills.category })
      .from(skills)
      .orderBy(skills.category);
    return rows.map((r) => r.category).filter(Boolean);
  });

  const leaderboardEntries = await getCached(
    env.KV,
    `leaderboard:home:best:0:${PAGE_SIZE}`,
    300,
    async () => {
      return db
        .select({
          slug: skills.slug,
          name: skills.name,
          author: skills.author,
          description: skills.description,
          category: skills.category,
          installs: skills.install_count,
          rating: skills.bayesian_rating,
          netVotes: skills.net_votes,
        })
        .from(skills)
        .orderBy(desc(skills.composite_score))
        .limit(PAGE_SIZE + 1);
    }
  );

  const hasMore = leaderboardEntries.length > PAGE_SIZE;
  const ranked = (hasMore ? leaderboardEntries.slice(0, PAGE_SIZE) : leaderboardEntries)
    .map((e, i) => ({
      ...e,
      rank: i + 1,
      installs: e.installs || 0,
      rating: e.rating || 0,
      netVotes: e.netVotes || 0,
    }));

  return { stats, featuredSkills, leaderboard: ranked, leaderboardHasMore: hasMore, categories, isAuthenticated };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { stats, featuredSkills, leaderboard, leaderboardHasMore, categories, isAuthenticated } = loaderData;

  return (
    <div className="flex flex-col items-center px-4">
      {/* Hero Section */}
      <div className="flex min-h-[50vh] flex-col items-center justify-center pt-8 text-center">
        <pre className="font-mono text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
          <code className="text-sx-fg">
            SKILL<span className="text-sx-accent">X</span>
          </code>
        </pre>

        <p className="mt-4 font-mono text-xs uppercase tracking-wide text-sx-fg-muted sm:text-sm">
          Search & Use Skills Without Installing Anything
        </p>

        <p className="mt-6 text-xl text-sx-fg sm:text-2xl">
          The Only Skill That Your AI Agent Needs.
        </p>

        <div className="mx-auto mt-8 flex max-w-lg flex-col gap-3">
          <div>
            <p className="mb-1.5 text-left font-mono text-xs text-sx-fg-muted">
              Install the skill:
            </p>
            <CommandBox command="npx skills add nextlevelbuilder/skillx" />
          </div>
          <div>
            <p className="mb-1.5 text-left font-mono text-xs text-sx-fg-muted">
              Then use it:
            </p>
            <CommandBox command='npx skillx-sh use "deploy to cloudflare" --search' />
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          <div className="rounded-lg border border-sx-border bg-sx-bg-elevated px-6 py-4 text-center">
            <div className="font-mono text-3xl font-bold text-sx-accent">
              {formatNumber(stats.skillCount)}+
            </div>
            <div className="mt-1 text-sm text-sx-fg-muted">Total Skills</div>
          </div>
          <div className="rounded-lg border border-sx-border bg-sx-bg-elevated px-6 py-4 text-center">
            <div className="font-mono text-3xl font-bold text-sx-accent">
              {formatNumber(stats.installCount)}+
            </div>
            <div className="mt-1 text-sm text-sx-fg-muted">Total Installs</div>
          </div>
          <div className="rounded-lg border border-sx-border bg-sx-bg-elevated px-6 py-4 text-center">
            <div className="font-mono text-3xl font-bold text-sx-accent">5+</div>
            <div className="mt-1 text-sm text-sx-fg-muted">Agents Supported</div>
          </div>
        </div>
      </div>

      {/* Featured Skills */}
      <div className="mt-16 w-full max-w-6xl">
        <h2 className="text-center font-mono text-xl font-bold text-sx-fg">
          Featured Skills
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredSkills.map((skill) => (
            <SkillCard
              key={skill.slug}
              slug={skill.slug}
              name={skill.name}
              author={skill.author}
              description={skill.description}
              category={skill.category}
              installs={skill.install_count || 0}
              rating={skill.avg_rating || 0}
            />
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="mt-16 w-full max-w-6xl pb-16">
        <h2 className="mb-6 text-center font-mono text-xl font-bold text-sx-fg">
          Leaderboard
        </h2>
        <HomeLeaderboard
          initialEntries={leaderboard}
          initialHasMore={leaderboardHasMore}
          categories={categories}
          isAuthenticated={isAuthenticated}
        />
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}
