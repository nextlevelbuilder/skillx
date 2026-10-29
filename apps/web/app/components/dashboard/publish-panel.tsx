import { Link } from "react-router";
import { Terminal } from "lucide-react";

interface PublishPanelProps {
  /** Active publisher handles the user owns (without `@`). */
  handles: string[];
}

/**
 * "Publish a new version": releases are published only with the CLI and a
 * publish-scoped key (or GitHub OIDC), never from the browser, so this panel
 * shows the exact command. Every release is free.
 */
export function PublishPanel({ handles }: PublishPanelProps) {
  const handle = handles[0] ?? "<publisher>";
  const command = `SKILLX_API_KEY=sx_... skillx publish ./my-skill --name @${handle}/my-skill --release-version 1.0.0 --visibility private`;
  return (
    <section className="mb-10 rounded-lg border border-sx-border bg-sx-bg-elevated p-5" aria-labelledby="publish-panel">
      <h2 id="publish-panel" className="mb-3 flex items-center gap-2 font-mono text-lg font-semibold">
        <Terminal size={18} className="text-sx-accent" /> Publish a new version
      </h2>
      <p className="mb-3 text-sm text-sx-fg-muted">Releases are published from your machine or CI with the SkillX CLI:</p>
      <pre className="overflow-x-auto rounded-lg border border-sx-border bg-sx-bg p-3 font-mono text-xs text-sx-fg">
        <code>{command}</code>
      </pre>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-sx-fg-muted">
        <li>
          Publishing needs a publish-scoped key (<code className="font-mono">releases:publish:@{handle}</code>) created in{" "}
          <Link to="/settings" className="text-sx-accent hover:underline">
            Settings
          </Link>
          , or GitHub Actions OIDC with <code className="font-mono">--oidc</code>. <code className="font-mono">skillx release publish</code> is the same
          command.
        </li>
        <li>
          <code className="font-mono">--visibility</code> is <code className="font-mono">public</code>, <code className="font-mono">unlisted</code> or{" "}
          <code className="font-mono">private</code> and applies only to a new package (default private); change it later here. A CLI older than the
          unlisted release refuses <code className="font-mono">unlisted</code>: publish as private, then switch it here.
        </li>
        <li>A version is immutable: publish a new version instead of replacing one, and yank a bad one here.</li>
        {handles.length === 0 && <li>You do not own an active publisher yet; an operator provisions publisher handles.</li>}
      </ul>
    </section>
  );
}
