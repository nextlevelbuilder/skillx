import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { ConfirmDialog } from "./confirm-dialog";
import { formatDate, useOwnerAction } from "./use-owner-action";

interface LifecycleActionsProps {
  /** `package` or `kit`, for the wording. */
  noun: string;
  identity: string;
  deletedAt: number | null;
  restoreDeadline: number | null;
  /** The delete or restore endpoint of this item. */
  urlFor: (action: "delete" | "restore") => string;
  disabled?: boolean;
}

const BUTTON = "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Delete (confirmed by typing the exact name) or, for a deleted item, Restore
 * with its deadline. After the 30-day window the item stays a tombstone: it
 * cannot be restored and its name is never reused.
 */
export function LifecycleActions({ noun, identity, deletedAt, restoreDeadline, urlFor, disabled = false }: LifecycleActionsProps) {
  const { run, busy, error, clearError } = useOwnerAction();
  const [confirming, setConfirming] = useState(false);

  if (deletedAt !== null) {
    const expired = restoreDeadline !== null && Date.now() > restoreDeadline;
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={disabled || busy || expired}
          onClick={() => void run(urlFor("restore"), {})}
          className={`${BUTTON} border-sx-accent/40 text-sx-accent hover:bg-sx-accent/10`}
        >
          <RotateCcw size={12} /> {busy ? "Restoring…" : "Restore"}
        </button>
        <span className="text-[11px] text-sx-fg-subtle">{expired ? "Restore window expired" : `Restorable until ${formatDate(restoreDeadline)}`}</span>
        {error && (
          <span role="alert" className="max-w-xs text-right text-[11px] text-red-400">
            {error}
          </span>
        )}
      </div>
    );
  }

  const close = () => {
    setConfirming(false);
    clearError();
  };
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setConfirming(true)} className={`${BUTTON} border-red-500/40 text-red-400 hover:bg-red-500/10`}>
        <Trash2 size={12} /> Delete
      </button>
      {confirming && (
        <ConfirmDialog
          title={`Delete ${identity}?`}
          confirmLabel={`Delete ${noun}`}
          requireText={identity}
          danger
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={async () => {
            if (await run(urlFor("delete"), {})) close();
          }}
        >
          <p>
            New requests for the {noun} stop being served at once: reads, listings, installs and download links refuse it, for everyone including you. You
            can restore it from this dashboard for 30 days.
          </p>
          <p>
            After 30 days it cannot be restored, and its name stays reserved: it can never be published again. Copies already installed, downloaded or cached
            elsewhere are not deleted or recalled.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
