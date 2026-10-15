import { Link, useLocation } from "react-router";

const TABS = [
  { to: "/docs", label: "CLI Guide" },
  { to: "/docs/agents", label: "Coding Agents Guide" },
  { to: "/docs/api", label: "API Reference" },
  { to: "/docs/publishers", label: "Publisher Guide" },
  { to: "/docs/harness", label: "Harness Integration" },
] as const;

export function DocsSubNav() {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Documentation sections" className="mb-8 flex flex-wrap gap-1 rounded-lg border border-sx-border bg-sx-bg-elevated p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`rounded-md px-4 py-2 font-mono text-sm transition-colors ${
              active
                ? "bg-sx-accent-muted text-sx-accent"
                : "text-sx-fg-muted hover:text-sx-fg"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
