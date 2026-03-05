import { FileText, BookOpen, Code, ExternalLink } from "lucide-react";

interface Reference {
  id: string;
  title: string;
  filename: string;
  url: string | null;
  type: string | null;
}

const typeIcons: Record<string, typeof FileText> = {
  docs: BookOpen,
  api: Code,
  guide: FileText,
};

export function SkillReferencesSection({ references }: { references: Reference[] }) {
  if (references.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">
        References
        <span className="ml-2 text-sm font-normal text-sx-fg-muted">
          ({references.length})
        </span>
      </h2>
      <div className="space-y-2">
        {references.map((ref) => {
          const Icon = typeIcons[ref.type ?? ""] ?? FileText;
          return (
            <div
              key={ref.id}
              className="flex items-center gap-3 rounded-lg border border-sx-border bg-sx-bg-elevated px-4 py-3 text-sm"
            >
              <Icon size={16} className="shrink-0 text-sx-fg-subtle" />
              <span className="min-w-0 flex-1 truncate text-sx-fg">{ref.title}</span>
              {ref.url && (
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sx-fg-muted transition-colors hover:text-mint"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
