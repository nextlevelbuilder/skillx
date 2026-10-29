import { useCallback, useState } from "react";
import { useRevalidator } from "react-router";

export type ActionResult = { ok: true; data: Record<string, unknown> } | { ok: false; message: string };

/**
 * POSTs one JSON owner action with the session cookie (same origin) and
 * reloads the dashboard data only after a 2xx JSON answer, so an API error is
 * never shown as success. Failures carry the server's `error.message` (and
 * code), or a network message.
 */
export async function postOwnerAction(url: string, body: Record<string, unknown>): Promise<ActionResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: "Network error: the change was not applied." };
  }
  const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || parsed === null) {
    const error = (parsed?.error ?? null) as { code?: string; message?: string } | null;
    const detail = error?.message ?? `HTTP ${res.status}`;
    return { ok: false, message: error?.code ? `${detail} (${error.code})` : detail };
  }
  return { ok: true, data: parsed };
}

/** One in-flight owner action at a time per component, with its error. */
export function useOwnerAction() {
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (url: string, body: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const result = await postOwnerAction(url, body);
        if (!result.ok) {
          setError(result.message);
          return false;
        }
        await revalidator.revalidate();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [revalidator],
  );

  return { run, busy, error, clearError: () => setError(null) };
}

/** `/api/v1/packages/@h/slug/<action>` or `/api/v1/kits/@h/name/<action>`; identities are `@scope/name` in lowercase. */
export const packageActionUrl = (identity: string, action: string) => `/api/v1/packages/${identity}/${action}`;
export const releaseStateUrl = (identity: string, version: string) => `/api/v1/packages/${identity}/releases/${encodeURIComponent(version)}/state`;
export const kitActionUrl = (identity: string, action: string) => `/api/v1/kits/${identity}/${action}`;

export const formatDate = (ms: number | null) => (ms === null ? "—" : new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC");
