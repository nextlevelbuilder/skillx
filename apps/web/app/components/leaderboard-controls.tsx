const SORT_OPTIONS = [
  { value: "best", label: "Best" },
  { value: "rating", label: "Rating" },
  { value: "installs", label: "Installs" },
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
];

interface LeaderboardControlsProps {
  sort: string;
  onSortChange: (sort: string) => void;
  category: string;
  onCategoryChange: (category: string) => void;
  categories: string[];
}

export function LeaderboardControls({
  sort,
  onSortChange,
  category,
  onCategoryChange,
  categories,
}: LeaderboardControlsProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {/* Sort tabs */}
      <div className="flex gap-1 rounded-lg border border-sx-border bg-sx-bg-elevated p-1">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSortChange(opt.value)}
            className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
              sort === opt.value
                ? "bg-sx-accent text-sx-bg font-bold"
                : "text-sx-fg-muted hover:text-sx-fg"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="rounded-lg border border-sx-border bg-sx-bg-elevated px-3 py-1.5 font-mono text-xs text-sx-fg"
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
