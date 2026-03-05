import { ExternalLink, Eye, ChevronUp, ChevronDown, Heart } from "lucide-react";
import { Link } from "react-router";
import { RatingBadge } from "./rating-badge";
import { SignalBadge } from "./signal-badge";

export interface LeaderboardEntry {
  rank: number;
  slug: string;
  name: string;
  author: string;
  description?: string;
  category?: string;
  installs: number;
  rating: number;
  netVotes: number;
  badges?: string[];
}

const isGitHubUsername = (name: string) =>
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(name);

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  onPreview?: (entry: LeaderboardEntry) => void;
  // Phase 3: interaction overlay props
  userFavorites?: Set<string>;
  userVotes?: Map<string, "up" | "down">;
  isAuthenticated?: boolean;
  onVote?: (slug: string, type: "up" | "down" | "none") => void;
  onFavoriteToggle?: (slug: string) => void;
  onAuthRequired?: () => void;
}

export function LeaderboardTable({
  entries,
  onPreview,
  userFavorites,
  userVotes,
  isAuthenticated,
  onVote,
  onFavoriteToggle,
  onAuthRequired,
}: LeaderboardTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-sx-border">
      <table className="w-full">
        <thead className="sticky top-0 bg-sx-bg-elevated">
          <tr className="border-b border-sx-border">
            <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wide text-sx-fg-muted">
              Rank
            </th>
            <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wide text-sx-fg-muted">
              Skill
            </th>
            <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wide text-sx-fg-muted">
              Author
            </th>
            <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wide text-sx-fg-muted">
              Installs
            </th>
            <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wide text-sx-fg-muted">
              Rating
            </th>
            <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-wide text-sx-fg-muted">
              Votes
            </th>
            <th className="px-4 py-3 text-right font-mono text-xs uppercase tracking-wide text-sx-fg-muted">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.slug}
              className={`h-12 border-b border-sx-border transition-colors hover:bg-sx-bg-hover ${
                entry.rank <= 3 ? "bg-sx-bg-elevated" : "bg-sx-bg"
              }`}
            >
              <td className="px-4 py-3">
                <span
                  className={`font-mono text-sm font-bold ${
                    entry.rank === 1
                      ? "text-tier-s"
                      : entry.rank === 2
                        ? "text-tier-a"
                        : entry.rank === 3
                          ? "text-tier-b"
                          : "text-sx-fg-muted"
                  }`}
                >
                  #{entry.rank}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center">
                  <Link
                    to={`/skills/${entry.slug}`}
                    className="font-medium text-sx-fg hover:text-sx-accent"
                  >
                    {entry.name}
                  </Link>
                  {entry.badges?.map((b) => (
                    <SignalBadge key={b} type={b} />
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-sm">
                {isGitHubUsername(entry.author) ? (
                  <a
                    href={`https://github.com/${entry.author}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sx-fg-muted hover:text-sx-accent"
                  >
                    {entry.author}
                  </a>
                ) : (
                  <span className="text-sx-fg-muted">{entry.author}</span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-sm text-sx-fg">
                {formatNumber(entry.installs)}
              </td>
              <td className="px-4 py-3">
                <RatingBadge score={entry.rating} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => {
                      if (!isAuthenticated) { onAuthRequired?.(); return; }
                      const currentVote = userVotes?.get(entry.slug) ?? null;
                      onVote?.(entry.slug, currentVote === "up" ? "none" : "up");
                    }}
                    className={`rounded p-0.5 transition-colors ${
                      userVotes?.get(entry.slug) === "up"
                        ? "text-sx-accent"
                        : "text-sx-fg-muted hover:text-sx-fg"
                    }`}
                    aria-label="Upvote"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <span className="min-w-[2ch] text-center font-mono text-xs text-sx-fg-muted">
                    {entry.netVotes}
                  </span>
                  <button
                    onClick={() => {
                      if (!isAuthenticated) { onAuthRequired?.(); return; }
                      const currentVote = userVotes?.get(entry.slug) ?? null;
                      onVote?.(entry.slug, currentVote === "down" ? "none" : "down");
                    }}
                    className={`rounded p-0.5 transition-colors ${
                      userVotes?.get(entry.slug) === "down"
                        ? "text-red-400"
                        : "text-sx-fg-muted hover:text-sx-fg"
                    }`}
                    aria-label="Downvote"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      if (!isAuthenticated) { onAuthRequired?.(); return; }
                      onFavoriteToggle?.(entry.slug);
                    }}
                    className={`rounded p-1 transition-colors ${
                      userFavorites?.has(entry.slug)
                        ? "text-pink-400"
                        : "text-sx-fg-muted hover:text-pink-400"
                    }`}
                    aria-label={userFavorites?.has(entry.slug) ? "Remove favorite" : "Add favorite"}
                  >
                    <Heart size={14} fill={userFavorites?.has(entry.slug) ? "currentColor" : "none"} />
                  </button>
                  {onPreview && (
                    <button
                      onClick={() => onPreview(entry)}
                      className="text-sx-fg-muted hover:text-sx-fg"
                      aria-label="Preview skill"
                    >
                      <Eye size={14} />
                    </button>
                  )}
                  <Link
                    to={`/skills/${entry.slug}`}
                    className="inline-flex items-center gap-1 text-sm text-sx-fg-muted hover:text-sx-fg"
                  >
                    View
                    <ExternalLink size={14} />
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
