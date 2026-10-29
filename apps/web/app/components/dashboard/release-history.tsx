import { useState } from "react";
import type { DashboardRelease } from "~/lib/creator/creator-dashboard";
import { ConfirmDialog } from "./confirm-dialog";
import { StateBadge } from "./state-badge";
import { formatDate, releaseStateUrl, useOwnerAction } from "./use-owner-action";

interface ReleaseHistoryProps {
  identity: string;
  releases: DashboardRelease[];
  truncated: boolean;
  /** Yanking is offered only for a live package of an active publisher. */
  canYank: boolean;
}

/**
 * Every release of one package, newest first, with its state. A published
 * release can be yanked (the owner edge `published -> yanked` of the state
 * API); undoing a yank is an operator action, so it is not offered here.
 */
export function ReleaseHistory({ identity, releases, truncated, canYank }: ReleaseHistoryProps) {
  const { run, busy, error, clearError } = useOwnerAction();
  const [yanking, setYanking] = useState<string | null>(null);

  if (releases.length === 0) return <p className="px-4 py-3 text-sm text-sx-fg-muted">No releases yet.</p>;

  const close = () => {
    setYanking(null);
    clearError();
  };
  return (
    <div className="overflow-x-auto px-4 py-3">
      <table className="w-full text-left text-xs">
        <thead className="text-sx-fg-subtle">
          <tr>
            <th className="py-1 pr-3 font-normal">Version</th>
            <th className="py-1 pr-3 font-normal">Channel</th>
            <th className="py-1 pr-3 font-normal">State</th>
            <th className="py-1 pr-3 font-normal">Published</th>
            <th className="py-1 pr-3 font-normal">Yanked</th>
            <th className="py-1 pr-3 font-normal">Tree digest</th>
            <th className="py-1 font-normal" />
          </tr>
        </thead>
        <tbody>
          {releases.map((r) => (
            <tr key={r.version} className="border-t border-sx-border/60">
              <td className="py-1.5 pr-3 font-mono text-sx-fg">{r.version}</td>
              <td className="py-1.5 pr-3 font-mono">{r.channel}</td>
              <td className="py-1.5 pr-3">
                <StateBadge state={r.state} />
              </td>
              <td className="py-1.5 pr-3">{formatDate(r.publishedAt)}</td>
              <td className="py-1.5 pr-3">{formatDate(r.yankedAt)}</td>
              <td className="py-1.5 pr-3 font-mono text-sx-fg-subtle" title={r.releaseDigest ?? undefined}>
                {r.releaseDigest === null ? "—" : `${r.releaseDigest.slice(0, 19)}…`}
              </td>
              <td className="py-1.5 text-right">
                {canYank && r.state === "published" && (
                  <button
                    type="button"
                    onClick={() => setYanking(r.version)}
                    className="rounded border border-amber-500/40 px-2 py-0.5 text-amber-400 hover:bg-amber-500/10"
                  >
                    Yank
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && <p className="mt-2 text-[11px] text-sx-fg-subtle">Only the newest {releases.length} releases are shown.</p>}

      {yanking !== null && (
        <ConfirmDialog
          title={`Yank ${identity}@${yanking}?`}
          confirmLabel="Yank release"
          danger
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={async () => {
            if (await run(releaseStateUrl(identity, yanking), { from: "published", to: "yanked" })) close();
          }}
        >
          <p>New installs by version stop resolving it (410). Lockfiles pinned to its digest keep working.</p>
          <p>Only an operator can publish a yanked release again.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
