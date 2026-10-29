import { useFetcher, useSearchParams } from "react-router";
import { Link2 } from "lucide-react";
import type { AgentKitLinkStatus } from "~/lib/agentkit/link-status";

const OUTCOME_TEXT: Record<string, { text: string; error: boolean }> = {
  linked: { text: "Your AgentKit account is linked.", error: false },
  denied: { text: "Linking was cancelled on agentkit.best.", error: true },
  expired: { text: "The link request expired or belongs to another session. Start again.", error: true },
  already_linked: { text: "This SkillX account is already linked. Unlink it first.", error: true },
  taken: { text: "That AgentKit account is already linked to another SkillX account.", error: true },
  failed: { text: "agentkit.best did not complete the link. Try again later.", error: true },
};

const SCOPE_TEXT: Record<string, string> = {
  "skillx-kits:read": "read your library and personal kits",
  "skillx-kits:write": "publish and manage your personal kits",
};

/** "Link with AgentKit" on /settings; renders nothing while the feature is off. */
export function AgentKitLinkSection({ status }: { status: AgentKitLinkStatus }) {
  const [params] = useSearchParams();
  const unlinkFetcher = useFetcher<{ error?: string }>();
  if (!status.enabled) return null;

  const outcome = OUTCOME_TEXT[params.get("agentkit") ?? ""];
  const unlinking = unlinkFetcher.state !== "idle";
  const handleUnlink = () => {
    if (!confirm("Unlink your AgentKit account? AgentKit apps will lose access to SkillX until you link again.")) return;
    unlinkFetcher.submit({}, { method: "delete", action: "/api/user/agentkit-link", encType: "application/json" });
  };

  return (
    <section id="agentkit" className="mb-8 rounded-lg border border-sx-border bg-sx-bg-elevated p-6">
      <h2 className="mb-2 flex items-center gap-2 font-mono text-lg font-semibold">
        <Link2 size={18} /> AgentKit account
      </h2>
      {outcome && (
        <p role="status" className={`mb-4 rounded-lg px-4 py-2 text-sm ${outcome.error ? "border border-red-500/40 bg-red-500/10 text-red-500" : "border border-sx-accent/30 bg-sx-accent/10 text-sx-accent"}`}>
          {outcome.text}
        </p>
      )}
      {status.linked ? (
        <div className="space-y-3 text-sm">
          <p className="text-sx-fg-muted">
            Linked on {new Date(status.linkedAt).toLocaleDateString()}. AgentKit apps (ak, Desktop) signed in to this account can{" "}
            {status.scopes.map((s) => SCOPE_TEXT[s] ?? s).join(" and ")}.
            {status.unverified && " agentkit.best could not be reached to confirm the link just now."}
          </p>
          <button
            onClick={handleUnlink}
            disabled={unlinking}
            className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            {unlinking ? "Unlinking…" : "Unlink"}
          </button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-sx-fg-muted">
            Optional. Link your agentkit.best account so ak and AgentKit Desktop can use your SkillX library and personal kits
            without a SkillX API key. GitHub sign-in and API keys keep working either way.
          </p>
          <form method="post" action="/auth/agentkit/start">
            <button type="submit" className="rounded-lg bg-sx-accent px-4 py-2 text-sm font-medium text-sx-bg transition-colors hover:bg-sx-accent-hover">
              Link with AgentKit
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
