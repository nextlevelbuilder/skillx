const TONES: Record<string, string> = {
  published: "border-sx-accent/40 bg-sx-accent/10 text-sx-accent",
  active: "border-sx-accent/40 bg-sx-accent/10 text-sx-accent",
  reviewed: "border-sx-accent/40 bg-sx-accent/10 text-sx-accent",
  public: "border-sx-accent/40 bg-sx-accent/10 text-sx-accent",
  yanked: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  unlisted: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  proposed: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  quarantined: "border-red-500/40 bg-red-500/10 text-red-400",
  rejected: "border-red-500/40 bg-red-500/10 text-red-400",
  deleted: "border-red-500/40 bg-red-500/10 text-red-400",
  suspended: "border-red-500/40 bg-red-500/10 text-red-400",
  revoked: "border-red-500/40 bg-red-500/10 text-red-400",
};

const NEUTRAL = "border-sx-border bg-sx-bg-elevated text-sx-fg-muted";

/** A small state label (release, revision, visibility, publisher). */
export function StateBadge({ state }: { state: string }) {
  return <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[11px] ${TONES[state] ?? NEUTRAL}`}>{state}</span>;
}
