import { useId, useState } from "react";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** The exact text the user must type before confirming (a package or kit name). */
  requireText?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation; stays open with the server error until the action succeeds or is cancelled. */
export function ConfirmDialog({ title, children, confirmLabel, requireText, danger = false, busy = false, error = null, onConfirm, onCancel }: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const titleId = useId();
  const inputId = useId();
  const ready = !busy && (requireText === undefined || typed === requireText);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-lg border border-sx-border bg-sx-bg p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onConfirm();
        }}
      >
        <h3 id={titleId} className="mb-3 font-mono text-lg font-semibold">
          {title}
        </h3>
        <div className="space-y-2 text-sm text-sx-fg-muted">{children}</div>

        {requireText !== undefined && (
          <div className="mt-4">
            <label htmlFor={inputId} className="mb-1 block text-sm">
              Type <code className="font-mono text-sx-fg">{requireText}</code> to confirm
            </label>
            <input
              id={inputId}
              type="text"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-lg border border-sx-border bg-sx-bg-elevated px-3 py-2 font-mono text-sm text-sx-fg"
            />
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg border border-sx-border px-4 py-2 text-sm text-sx-fg-muted hover:text-sx-fg">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              danger ? "bg-red-500 text-white hover:bg-red-600" : "bg-sx-accent text-sx-bg hover:bg-sx-accent-hover"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
