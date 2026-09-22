import { Search, X, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { RatingBadge } from "./rating-badge";

interface SearchResult {
  slug: string;
  name: string;
  author: string;
  description: string;
  category: string;
  avg_rating?: number;
  install_count?: number;
  final_score?: number;
}

interface SearchCommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function SearchCommandPalette({ open, onClose }: SearchCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
      const data = (await res.json()) as { results?: SearchResult[] };
      setResults(data.results || []);
      setSelectedIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 250);
  };

  const handleSelect = (slug: string) => {
    onClose();
    navigate(`/skills/${slug}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex].slug);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl rounded-xl border border-sx-border bg-sx-bg shadow-2xl">
        {/* Search Input */}
        <div className="flex items-center border-b border-sx-border px-4">
          <Search className="shrink-0 text-sx-fg-muted" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search skills..."
            className="w-full bg-transparent px-3 py-4 font-mono text-sm text-sx-fg placeholder:text-sx-fg-muted focus:outline-none"
          />
          <div className="flex shrink-0 items-center gap-2">
            {query && (
              <button
                onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
                className="rounded p-1 text-sx-fg-muted hover:text-sx-fg"
              >
                <X size={14} />
              </button>
            )}
            <kbd className="rounded border border-sx-border bg-sx-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-sx-fg-subtle">
              ESC
            </kbd>
          </div>
        </div>

        {/* Results */}
        {query.trim() && (
          <div className="max-h-80 overflow-y-auto p-2">
            {loading ? (
              <div className="px-3 py-6 text-center text-sm text-sx-fg-muted">
                Searching...
              </div>
            ) : results.length > 0 ? (
              results.map((result, index) => (
                <button
                  key={result.slug}
                  onClick={() => handleSelect(result.slug)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    index === selectedIndex
                      ? "bg-sx-accent-muted text-sx-fg"
                      : "text-sx-fg hover:bg-sx-bg-hover"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{result.name}</span>
                      <span className="shrink-0 text-xs text-sx-fg-subtle">by {result.author}</span>
                      <span className="shrink-0 rounded bg-sx-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-sx-fg-muted">
                        {result.category}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-sx-fg-muted">
                      {result.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {result.final_score != null && (
                      <span className="rounded bg-sx-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-sx-accent">
                        {Math.round(result.final_score * 100)}%
                      </span>
                    )}
                    {result.avg_rating ? (
                      <RatingBadge score={result.avg_rating} />
                    ) : null}
                    <ArrowRight size={14} className="text-sx-fg-subtle" />
                  </div>
                </button>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-sx-fg-muted">
                No skills found for "{query}"
              </div>
            )}
          </div>
        )}

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-sx-border px-4 py-2 text-[10px] text-sx-fg-subtle">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-sx-border px-1 py-0.5 font-mono">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-sx-border px-1 py-0.5 font-mono">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-sx-border px-1 py-0.5 font-mono">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
