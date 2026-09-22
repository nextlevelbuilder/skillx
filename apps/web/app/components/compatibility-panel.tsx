/**
 * Compatibility badge and its evidence detail.
 *
 * The badge deliberately distinguishes `declared` from `verified`: a publisher
 * saying a skill works is not the same as someone having probed that exact
 * artifact. `unknown` is shown as an explicit state rather than hidden, because a
 * visitor who sees no badge would otherwise assume support.
 *
 * Tokens: dark-only theme, mint accent, `bg-slate-900` surfaces (see
 * docs/design-guidelines.md).
 */

import { CheckCircle2, AlertTriangle, Ban, HelpCircle, FlaskConical } from "lucide-react";
import type { CompatibilitySummary } from "@skillx/contracts";

interface BadgeTone {
  label: string;
  className: string;
  Icon: typeof CheckCircle2;
}

const TONES: Record<string, BadgeTone> = {
  verified: {
    label: "Verified",
    className: "border-mint/40 bg-mint/10 text-mint",
    Icon: FlaskConical,
  },
  declared: {
    label: "Declared",
    className: "border-sky-400/40 bg-sky-400/10 text-sky-300",
    Icon: CheckCircle2,
  },
  unknown: {
    label: "Unknown",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    Icon: HelpCircle,
  },
  unsupported: {
    label: "Unsupported",
    className: "border-red-400/30 bg-red-400/10 text-red-300",
    Icon: Ban,
  },
  blocked: {
    label: "Blocked",
    className: "border-red-400/30 bg-red-400/10 text-red-300",
    Icon: AlertTriangle,
  },
};

const FALLBACK: BadgeTone = TONES.unknown;

export function CompatibilityBadge({ summary }: { summary: CompatibilitySummary }) {
  const tone = TONES[summary.status] ?? FALLBACK;
  const { Icon } = tone;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone.className}`}
      title={`${summary.runtime}: ${summary.status}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="font-mono">{summary.runtime}</span>
      <span>{tone.label}</span>
      {summary.versions ? (
        <span className="font-mono text-[11px] opacity-70">{summary.versions}</span>
      ) : null}
    </span>
  );
}

/**
 * The panel under the badges.
 *
 * It states what each tier means, because a badge alone cannot tell a reader
 * whether anyone actually ran the thing on the artifact they are about to install.
 */
export function CompatibilityPanel({ summaries }: { summaries: CompatibilitySummary[] }) {
  if (summaries.length === 0) {
    return (
      <section className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4">
        <h2 className="text-sm font-semibold text-amber-200">Compatibility not declared</h2>
        <p className="mt-1 text-sm text-slate-300">
          The publisher has not declared which agent runtimes this skill supports. That is not a claim
          that it works everywhere — an agent should treat it as unknown until evidence exists.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-700/60 bg-slate-900 p-4">
      <h2 className="text-sm font-semibold text-white">Compatibility</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {summaries.map((summary) => (
          <CompatibilityBadge key={summary.runtime} summary={summary} />
        ))}
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        {summaries.map((summary) => (
          <div key={summary.runtime} className="border-t border-slate-800 pt-2 first:border-0 first:pt-0">
            <dt className="font-mono text-xs text-slate-400">{summary.runtime}</dt>
            <dd className="text-slate-300">
              {summary.verifiedAt ? (
                <>
                  Verified against this artifact on{" "}
                  <time dateTime={summary.verifiedAt}>{summary.verifiedAt.slice(0, 10)}</time>
                  {summary.probeId ? <> · probe <span className="font-mono">{summary.probeId}</span></> : null}
                </>
              ) : (
                <>
                  Declared by the publisher. No probe of this exact artifact is recorded
                  {summary.reasonCodes.length > 0 ? (
                    <> · <span className="font-mono text-xs">{summary.reasonCodes.join(", ")}</span></>
                  ) : null}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
