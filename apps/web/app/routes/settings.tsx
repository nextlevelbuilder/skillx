import { useLoaderData, useFetcher } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { PageContainer } from "../components/layout/page-container";
import { ApiKeyCreateDialog, ApiKeyRevealDialog } from "../components/settings/api-key-create-dialog";
import { ApiKeysTable } from "../components/settings/api-keys-table";
import { Key, Plus } from "lucide-react";
import { getSession } from "~/lib/auth/session-helpers";
import { getDb } from "~/lib/db";
import { listOwnedActivePublishers, listUserApiKeys } from "~/lib/auth/user-api-keys";
import type { CreateKeyRequest } from "~/lib/auth/api-key-form";
import { useEffect, useState } from "react";

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
  const createFetcher = useFetcher<CreateKeyResponse>();
  const deleteFetcher = useFetcher<{ error?: string }>();
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [generated, setGenerated] = useState<{ key: string; scopes: string[] | null } | null>(null);

  // Show the generated key once when the create request returns it.
  useEffect(() => {
    const result = createFetcher.data;
    if (result?.key) setGenerated({ key: result.key, scopes: result.scopes ?? null });
  }, [createFetcher.data]);

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

  const handleGenerateKey = (body: CreateKeyRequest) => {
    createFetcher.submit({ ...body }, { method: "post", action: "/api/user/api-keys", encType: "application/json" });
    setShowNewKeyModal(false);
  };

  const handleDeleteKey = (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key?")) return;
    deleteFetcher.submit({ id: keyId }, { method: "delete", action: "/api/user/api-keys", encType: "application/json" });
  };

  const error = createFetcher.state === "idle" ? createFetcher.data?.error : undefined;
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
          onCancel={() => setShowNewKeyModal(false)}
        />
      )}

      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-lg font-semibold">API Keys</h2>
          <button
            onClick={() => setShowNewKeyModal(true)}
            className="flex items-center gap-2 rounded-lg bg-sx-accent px-4 py-2 text-sm font-medium text-sx-bg transition-colors hover:bg-sx-accent-hover"
          >
            <Plus size={16} />
            Generate New Key
          </button>
        </div>

        {(error || revokeError) && (
          <p role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-500">
            {error ?? revokeError}
          </p>
        )}

        <ApiKeysTable keys={data.keys} onRevoke={handleDeleteKey} />
      </div>
    </PageContainer>
  );
}
