/**
 * Risk banner for a scanned listing.
 *
 * `danger` and `caution` stay separate rather than collapsing into one
 * "warning": the first says the scanner found suspicious patterns, the second
 * says some content deserves a look. Merging them would tell a reader the two
 * mean the same thing.
 */

import { ShieldAlert } from "lucide-react";

export function RiskWarningBanner({ riskLabel }: { riskLabel?: string | null }) {
  if (riskLabel === "danger") {
    return (
      <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        <ShieldAlert className="mr-2 inline h-4 w-4" />
        Suspicious content patterns detected. Review carefully before use.
      </div>
    );
  }

  if (riskLabel === "caution") {
    return (
      <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
        <ShieldAlert className="mr-2 inline h-4 w-4" />
        Some content patterns flagged for review.
      </div>
    );
  }

  return null;
}
