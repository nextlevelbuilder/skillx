import { X } from "lucide-react";
import { Link } from "react-router";
import { RatingBadge } from "./rating-badge";
import type { LeaderboardEntry } from "./leaderboard-table";

interface SkillPreviewModalProps {
  entry: LeaderboardEntry;
  onClose: () => void;
}

export function SkillPreviewModal({ entry, onClose }: SkillPreviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-lg rounded-xl border border-sx-border bg-sx-bg-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-sx-fg">{entry.name}</h3>
          <button
            onClick={onClose}
            className="text-sx-fg-muted hover:text-sx-fg"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mt-1 text-sm text-sx-fg-muted">
          by{" "}
          <a
            href={`https://github.com/${entry.author}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sx-accent hover:underline"
          >
            {entry.author}
          </a>
        </p>

        {entry.category && (
          <span className="mt-2 inline-block rounded-full border border-sx-border bg-sx-bg px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sx-fg-muted">
            {entry.category}
          </span>
        )}

        {entry.description && (
          <p className="mt-3 text-sm leading-relaxed text-sx-fg">
            {entry.description}
          </p>
        )}

        <div className="mt-4 flex items-center gap-4 text-sm">
          <span className="font-mono text-sx-fg-muted">
            {formatNumber(entry.installs)} installs
          </span>
          <RatingBadge score={entry.rating} />
          <span className="font-mono text-sx-fg-muted">
            {entry.netVotes} votes
          </span>
        </div>

        <Link
          to={`/skills/${entry.slug}`}
          className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-sx-accent py-2 text-sm font-bold text-sx-bg hover:opacity-90"
        >
          View Full Details
        </Link>
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
