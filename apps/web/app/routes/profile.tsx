import type { Route } from "./+types/profile";
import { PageContainer } from "../components/layout/page-container";
import { SkillCard } from "../components/skill-card";
import { User } from "lucide-react";
import { getDb } from "~/lib/db";
import { getSession } from "~/lib/auth/session-helpers";
import { fetchProfileData } from "~/lib/catalog/profile-skill-queries";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);

  if (!session?.user) {
    return { user: null, favoriteSkills: [], usageHistory: [] };
  }

  const db = getDb(env.DB);

  const { favoriteSkills, usageHistory } = await fetchProfileData(db, session.user.id);

  return {
    user: session.user,
    favoriteSkills,
    usageHistory,
  };
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { user, favoriteSkills, usageHistory } = loaderData;
  const isAuthenticated = !!user;

  if (!isAuthenticated) {
    return (
      <PageContainer>
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-8 text-center">
            <User className="mx-auto mb-4 text-sx-fg-muted" size={48} />
            <h2 className="mb-2 font-mono text-xl font-bold">Login Required</h2>
            <p className="text-sx-fg-muted">
              Please log in to view your profile.
            </p>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="mb-8">
        <h1 className="font-mono text-3xl font-bold">Profile</h1>
        <p className="mt-2 text-sx-fg-muted">Your favorites and usage history.</p>
      </div>

      {/* Avatar & Name */}
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sx-accent-muted">
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name}
              className="h-full w-full rounded-full"
            />
          ) : (
            <User className="text-sx-accent" size={32} />
          )}
        </div>
        <div>
          <h2 className="font-mono text-xl font-semibold">
            {user?.name || "User Name"}
          </h2>
          <p className="text-sm text-sx-fg-muted">
            {user?.email || "user@example.com"}
          </p>
        </div>
      </div>

      {/* Favorites */}
      <div className="mb-8">
        <h2 className="mb-4 font-mono text-lg font-semibold">Favorites</h2>
        {favoriteSkills.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {favoriteSkills.map((skill) => (
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
        ) : (
          <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-8 text-center">
            <p className="text-sx-fg-muted">No favorites yet.</p>
          </div>
        )}
      </div>

      {/* Usage History */}
      <div className="mb-8">
        <h2 className="mb-4 font-mono text-lg font-semibold">Usage History</h2>
        {usageHistory.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-sx-border">
            <table className="w-full">
              <thead className="bg-sx-bg-elevated">
                <tr className="border-b border-sx-border">
                  <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wide text-sx-fg-muted">
                    Skill
                  </th>
                  <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wide text-sx-fg-muted">
                    Outcome
                  </th>
                  <th className="hidden px-4 py-3 text-left font-mono text-xs uppercase tracking-wide text-sx-fg-muted sm:table-cell">
                    Model
                  </th>
                  <th className="hidden px-4 py-3 text-left font-mono text-xs uppercase tracking-wide text-sx-fg-muted md:table-cell">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-right font-mono text-xs uppercase tracking-wide text-sx-fg-muted">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {usageHistory.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-sx-border last:border-0"
                  >
                    <td className="px-4 py-3">
                      <a
                        href={`/skills/${entry.skillSlug}`}
                        className="font-medium text-sx-accent hover:underline"
                      >
                        {entry.skillName}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          entry.outcome === "success"
                            ? "bg-green-500/10 text-green-400"
                            : entry.outcome === "failure"
                              ? "bg-red-500/10 text-red-400"
                              : "bg-yellow-500/10 text-yellow-400"
                        }`}
                      >
                        {entry.outcome}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-sx-fg-muted sm:table-cell">
                      {entry.model || "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-sx-fg-muted md:table-cell">
                      {entry.duration_ms ? `${entry.duration_ms}ms` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-sx-fg-muted">
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                      }).format(new Date(entry.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-8 text-center">
            <p className="text-sx-fg-muted">No usage history yet.</p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
