import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { PageContainer } from "../components/layout/page-container";
import { ApiKeyCreateDialog, ApiKeyRevealDialog } from "../components/settings/api-key-create-dialog";
import { ApiKeysTable } from "../components/settings/api-keys-table";
import { Key, Plus } from "lucide-react";
import { getSession } from "~/lib/auth/session-helpers";
import { getDb } from "~/lib/db";
import { listOwnedActivePublishers, listUserApiKeys } from "~/lib/auth/user-api-keys";
import type { CreateKeyRequest } from "~/lib/auth/api-key-form";
import { useState } from "react";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);

  if (!session?.user?.id) {
    return { isAuthenticated: false, keys: [], publishers: [] };
  }

  const db = getDb(env.DB);
  const [keys, publishers] = await Promise.all([
    listUserApiKeys(db, session.user.id),
    listOwnedActivePublishers(db, session.user.id),
  ]);
  return { isAuthenticated: true, keys, publishers };
}

interface CreateKeyResponse {
  key?: string;
  scopes?: string[] | null;
  error?: string;
}

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const deleteFetcher = useFetcher<{ error?: string }>();
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // The plaintext key lives only in this state, so closing the reveal dialog drops it.
  const [generated, setGenerated] = useState<{ key: string; scopes: string[] | null } | null>(null);

  if (!data.isAuthenticated) {
    return (
      <PageContainer>
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-8 text-center">
            <Key className="mx-auto mb-4 text-sx-fg-muted" size={48} />
            <h2 className="mb-2 font-mono text-xl font-bold">Login Required</h2>
            <p className="text-sx-fg-muted">Please log in to manage your API keys.</p>
          </div>
        </div>
      </PageContainer>
    );
  }

  // The dialog stays open, with its inputs, until the server answers; a 400/403 is shown inside it.
  const handleGenerateKey = async (body: CreateKeyRequest) => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await res.json().catch(() => ({}))) as CreateKeyResponse;
      if (!res.ok || !result.key) {
        setCreateError(result.error ?? `Could not create the key (HTTP ${res.status})`);
        return;
      }
      setGenerated({ key: result.key, scopes: result.scopes ?? null });
      setShowNewKeyModal(false);
      revalidator.revalidate();
    } catch {
      setCreateError("Network error. Could not create the key.");
    } finally {
      setCreating(false);
    }
  };

  const openNewKeyModal = () => {
    setCreateError(null);
    setShowNewKeyModal(true);
  };

  const handleDeleteKey = (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key?")) return;
    deleteFetcher.submit({ id: keyId }, { method: "delete", action: "/api/user/api-keys", encType: "application/json" });
  };

  const revokeError = deleteFetcher.state === "idle" ? deleteFetcher.data?.error : undefined;

  return (
    <PageContainer>
      <div className="mb-8">
        <h1 className="font-mono text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-sx-fg-muted">Manage your API keys.</p>
      </div>

      {generated && (
        <ApiKeyRevealDialog plaintext={generated.key} scopes={generated.scopes} onClose={() => setGenerated(null)} />
      )}

      {showNewKeyModal && (
        <ApiKeyCreateDialog
          publishers={data.publishers}
          onSubmit={handleGenerateKey}
          submitting={creating}
          error={createError}
          onCancel={() => setShowNewKeyModal(false)}
        />
      )}

      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-lg font-semibold">API Keys</h2>
          <button
            onClick={openNewKeyModal}
            className="flex items-center gap-2 rounded-lg bg-sx-accent px-4 py-2 text-sm font-medium text-sx-bg transition-colors hover:bg-sx-accent-hover"
          >
            <Plus size={16} />
            Generate New Key
          </button>
        </div>

        {revokeError && (
          <p role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-500">
            {revokeError}
          </p>
        )}

        <ApiKeysTable keys={data.keys} onRevoke={handleDeleteKey} />
      </div>
    </PageContainer>
  );
}
