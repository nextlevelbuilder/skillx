import { useState } from "react";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import type { DashboardPackage } from "~/lib/creator/creator-dashboard";
import { LifecycleActions } from "./lifecycle-actions";
import { ReleaseHistory } from "./release-history";
import { StateBadge } from "./state-badge";
import { packageActionUrl } from "./use-owner-action";
import { VisibilityControl } from "./visibility-control";

export type SectionData<T> = { status: "available"; items: T[]; truncated: boolean; limit: number } | { status: "unavailable"; reason: string };

export function Unavailable({ what, reason }: { what: string; reason: string }) {
  return (
    <p className="rounded-lg border border-sx-border bg-sx-bg-elevated px-4 py-3 text-sm text-sx-fg-muted">
      {what} unavailable: {reason}
    </p>
  );
}

function PackageRow({ pkg }: { pkg: DashboardPackage }) {
  const [open, setOpen] = useState(false);
  const deleted = pkg.deletedAt !== null;
  const active = pkg.publisherState === "active";
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
          <span className="truncate">{pkg.identity}</span>
          <span className="text-xs text-sx-fg-subtle">
            {pkg.kind} · {pkg.releases.length}
            {pkg.releasesTruncated ? "+" : ""} release{pkg.releases.length === 1 ? "" : "s"}
          </span>
        </button>
        {!active && <StateBadge state={pkg.publisherState} />}
        {deleted ? <StateBadge state="deleted" /> : <VisibilityControl identity={pkg.identity} visibility={pkg.visibility} disabled={!active} />}
        <LifecycleActions
          noun="package"
          identity={pkg.identity}
          deletedAt={pkg.deletedAt}
          restoreDeadline={pkg.restoreDeadline}
          urlFor={(action) => packageActionUrl(pkg.identity, action)}
          disabled={!active}
        />
      </div>
      {open && (
        <div className="border-t border-sx-border">
          <ReleaseHistory identity={pkg.identity} releases={pkg.releases} truncated={pkg.releasesTruncated} canYank={active && !deleted} />
        </div>
      )}
    </li>
  );
}

/** "My packages": every package of the publishers the user owns, deleted ones included. */
export function PackagesSection({ data }: { data: SectionData<DashboardPackage> }) {
  return (
    <section className="mb-10" aria-labelledby="my-packages">
      <h2 id="my-packages" className="mb-4 flex items-center gap-2 font-mono text-lg font-semibold">
        <Package size={18} className="text-sx-accent" /> My packages
      </h2>
      {data.status === "unavailable" ? (
        <Unavailable what="Packages" reason={data.reason} />
      ) : data.items.length === 0 ? (
        <p className="text-sm text-sx-fg-muted">You have no packages yet. Publish one with the CLI below.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {data.items.map((pkg) => (
              <PackageRow key={pkg.identity} pkg={pkg} />
            ))}
          </ul>
          {data.truncated && <p className="mt-2 text-xs text-sx-fg-subtle">Showing the first {data.limit} packages by name.</p>}
        </>
      )}
    </section>
  );
}
