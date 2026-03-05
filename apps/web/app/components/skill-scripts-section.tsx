import { Terminal, ExternalLink } from "lucide-react";
import { CommandBox } from "./command-box";

interface Script {
  name: string;
  command: string;
  url: string;
}

/** Strip ANSI escape sequences for safe display */
function sanitize(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

export function SkillScriptsSection({ scripts }: { scripts: Script[] }) {
  if (scripts.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">
        Scripts
        <span className="ml-2 text-sm font-normal text-sx-fg-muted">
          ({scripts.length})
        </span>
      </h2>
      <div className="space-y-3">
        {scripts.map((script) => (
          <div key={script.name} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <Terminal size={14} className="text-sx-fg-subtle" />
              <span className="font-medium text-sx-fg">{sanitize(script.name)}</span>
              {script.url && (
                <a
                  href={script.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sx-fg-muted transition-colors hover:text-mint"
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
            <CommandBox command={sanitize(script.command)} />
          </div>
        ))}
      </div>
    </div>
  );
}
