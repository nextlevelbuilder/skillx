import { useState } from "react";
import { MAX_KEY_SCOPES } from "~/lib/auth/api-key-scopes";
import { buildCreateKeyRequest, describeKeyAccess, toggleScopeHandle } from "~/lib/auth/api-key-form";
import type { CreateKeyRequest } from "~/lib/auth/api-key-form";
import type { OwnedPublisher } from "~/lib/auth/user-api-keys";

interface ApiKeyCreateDialogProps {
  /** Active publishers the user owns; the only handles a publishing key may name. */
  publishers: OwnedPublisher[];
  onSubmit: (request: CreateKeyRequest) => void;
  /** A request is in flight; the form keeps its inputs and disables submitting. */
  submitting?: boolean;
  /** Server error from the last attempt (400/403), shown above the buttons. */
  error?: string | null;
  onCancel: () => void;
}

/**
 * New-key form. With no publisher selected (the default) it creates an
 * account key, which can never publish releases; selecting publishers makes a
 * release-publishing key restricted to exactly those handles.
 */
export function ApiKeyCreateDialog({ publishers, onSubmit, submitting = false, error = null, onCancel }: ApiKeyCreateDialogProps) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const request = buildCreateKeyRequest(name, selected);
  const atLimit = selected.length >= MAX_KEY_SCOPES;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <form
        role="dialog"
        aria-labelledby="new-key-title"
        className="w-full max-w-lg rounded-lg border border-sx-border bg-sx-bg p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (request.name && !submitting) onSubmit(request);
        }}
      >
        <h3 id="new-key-title" className="mb-4 font-mono text-lg font-semibold">
          Generate New API Key
        </h3>

        <label htmlFor="new-key-name" className="mb-1 block text-sm font-medium">
          Name
        </label>
        <input
          id="new-key-name"
          type="text"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name (e.g., Production CLI)"
          className="mb-4 w-full rounded-lg border border-sx-border bg-sx-bg-elevated px-4 py-2 text-sx-fg"
        />

        <fieldset className="mb-4">
          <legend className="mb-1 text-sm font-medium">Release publishing (optional)</legend>
          {publishers.length === 0 ? (
            <p className="text-sm text-sx-fg-muted">
              You do not own an active publisher, so this key will be an account key.
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm text-sx-fg-muted">
                Leave all unchecked for an account key. Select publishers to create a CI key that can only publish
                releases for them (up to {MAX_KEY_SCOPES}).
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {publishers.map((p) => {
                  const checked = selected.includes(p.handle);
                  return (
                    <li key={p.handle}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="publish-scope"
                          value={p.handle}
                          checked={checked}
                          disabled={!checked && atLimit}
                          onChange={() => setSelected((s) => toggleScopeHandle(s, p.handle))}
                        />
                        <span className="font-mono">releases:publish:@{p.handle}</span>
                        <span className="text-sx-fg-muted">{p.display_name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </fieldset>

        <p className="mb-4 rounded-lg bg-sx-bg-elevated p-3 text-sm text-sx-fg-muted" aria-live="polite">
          {describeKeyAccess(request.scopes ?? null)}
        </p>

        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-500">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!request.name || submitting}
            className="flex-1 rounded-lg bg-sx-accent px-4 py-2 font-medium text-sx-bg transition-colors hover:bg-sx-accent-hover disabled:opacity-50"
          >
            {submitting ? "Generating…" : "Generate"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-sx-border px-4 py-2 font-medium transition-colors hover:bg-sx-bg-hover"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

interface ApiKeyRevealDialogProps {
  plaintext: string;
  scopes: string[] | null;
  onClose: () => void;
}

/** Shows a freshly generated key exactly once; the server never returns it again. */
export function ApiKeyRevealDialog({ plaintext, scopes, onClose }: ApiKeyRevealDialogProps) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div role="dialog" aria-labelledby="key-generated-title" className="w-full max-w-lg rounded-lg border border-sx-border bg-sx-bg p-6">
        <h3 id="key-generated-title" className="mb-4 font-mono text-lg font-semibold">
          API Key Generated
        </h3>
        <p className="mb-2 text-sm text-sx-fg-muted">Copy this key now. It will not be shown again.</p>
        <p className="mb-4 text-sm text-sx-fg-muted">{describeKeyAccess(scopes)}</p>
        <div className="mb-6 break-all rounded-lg bg-sx-bg-elevated p-4 font-mono text-sm">{plaintext}</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(plaintext).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
            className="flex-1 rounded-lg bg-sx-accent px-4 py-2 font-medium text-sx-bg transition-colors hover:bg-sx-accent-hover"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-sx-border px-4 py-2 font-medium transition-colors hover:bg-sx-bg-hover"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
