import { Trash2 } from "lucide-react";
import { describeScope } from "~/lib/auth/api-key-form";

export interface ApiKeyRow {
  id: string;
  name: string;
  key_masked: string;
  created_at: number | string | Date;
  scopes: string[] | null;
}

interface ApiKeysTableProps {
  keys: ApiKeyRow[];
  onRevoke: (keyId: string) => void;
}

const formatDate = (timestamp: number | string | Date) =>
  new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(timestamp));

const headerClass = "px-4 py-3 text-left font-mono text-xs uppercase tracking-wide text-sx-fg-muted";

/** The user's active keys with what each one is allowed to do. */
export function ApiKeysTable({ keys, onRevoke }: ApiKeysTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-sx-border">
      <table className="w-full">
        <thead className="bg-sx-bg-elevated">
          <tr className="border-b border-sx-border">
            <th className={headerClass}>Name</th>
            <th className={headerClass}>Key</th>
            <th className={headerClass}>Access</th>
            <th className={headerClass}>Created</th>
            <th className={`${headerClass} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {keys.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sx-fg-muted">
                No API keys yet. Generate one to get started.
              </td>
            </tr>
          ) : (
            keys.map((key) => (
              <tr key={key.id} className="border-b border-sx-border last:border-0">
                <td className="px-4 py-3 font-medium">{key.name}</td>
                <td className="px-4 py-3 font-mono text-sm text-sx-fg-muted">{key.key_masked}</td>
                <td className="px-4 py-3 text-sm">
                  {key.scopes === null ? (
                    <span className="rounded bg-sx-bg-elevated px-2 py-0.5 text-sx-fg-muted">Account key</span>
                  ) : key.scopes.length === 0 ? (
                    <span className="rounded bg-sx-bg-elevated px-2 py-0.5 text-sx-fg-muted">No access</span>
                  ) : (
                    <ul className="space-y-1">
                      {key.scopes.map((scope) => (
                        <li key={scope} title={scope} className="font-mono text-xs">
                          {describeScope(scope)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-sx-fg-muted">{formatDate(key.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onRevoke(key.id)}
                    aria-label={`Revoke ${key.name}`}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                    Revoke
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
