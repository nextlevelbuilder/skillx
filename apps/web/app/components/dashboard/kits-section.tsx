import { useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import type { DashboardKit } from "~/lib/creator/creator-dashboard";
import { LifecycleActions } from "./lifecycle-actions";
import { Unavailable } from "./packages-section";
import type { SectionData } from "./packages-section";
import { StateBadge } from "./state-badge";
import { formatDate, kitActionUrl } from "./use-owner-action";

function KitRow({ kit }: { kit: DashboardKit }) {
  const [open, setOpen] = useState(false);
  const active = kit.publisherState === "active";
  return (
    <li className="rounded-lg border border-sx-border bg-sx-bg-elevated">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left font-mono text-sm text-sx-fg hover:text-sx-accent"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="truncate">{kit.identity}</span>
          <span className="text-xs text-sx-fg-subtle">
            effective {kit.effectiveRevision === null ? "none" : `#${kit.effectiveRevision.number}`} · latest #{kit.latestRevisionNumber} · generation {kit.generation}
          </span>
        </button>
        {!active && <StateBadge state={kit.publisherState} />}
        {/* Kit visibility lives in its revision document; it changes by activating a revision, not here. */}
        <StateBadge state={kit.deletedAt === null ? kit.visibility : "deleted"} />
        <LifecycleActions
          noun="kit"
          identity={kit.identity}
          deletedAt={kit.deletedAt}
          restoreDeadline={kit.restoreDeadline}
          urlFor={(action) => kitActionUrl(kit.identity, action)}
          disabled={!active}
        />
      </div>
      {open && (
        <div className="border-t border-sx-border px-4 py-3">
          {kit.revisions.length === 0 ? (
            <p className="text-sm text-sx-fg-muted">No revisions.</p>
          ) : (
            <ol className="space-y-1 text-xs">
              {kit.revisions.map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <span className="w-10 font-mono text-sx-fg">#{r.number}</span>
                  <StateBadge state={r.state} />
                  {kit.effectiveRevision?.id === r.id && <StateBadge state="active" />}
                  <span className="text-sx-fg-subtle">{formatDate(r.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
          {kit.latestRevisionNumber > kit.revisions.length && <p className="mt-2 text-[11px] text-sx-fg-subtle">Only the newest {kit.revisions.length} revisions are shown.</p>}
        </div>
      )}
    </li>
  );
}

/** "My personal kits": the user's kits with their revision history, deleted ones included. */
export function KitsSection({ data }: { data: SectionData<DashboardKit> }) {
  return (
    <section className="mb-10" aria-labelledby="my-kits">
      <h2 id="my-kits" className="mb-4 flex items-center gap-2 font-mono text-lg font-semibold">
        <Layers size={18} className="text-sx-accent" /> My personal kits
      </h2>
      {data.status === "unavailable" ? (
        <Unavailable what="Personal kits" reason={data.reason} />
      ) : data.items.length === 0 ? (
        <p className="text-sm text-sx-fg-muted">You have no personal kits.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {data.items.map((kit) => (
              <KitRow key={kit.identity} kit={kit} />
            ))}
          </ul>
          {data.truncated && <p className="mt-2 text-xs text-sx-fg-subtle">Showing the first {data.limit} kits by name.</p>}
        </>
      )}
    </section>
  );
}
