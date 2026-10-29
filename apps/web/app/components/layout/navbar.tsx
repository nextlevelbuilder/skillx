import { Link } from "react-router";
import { Menu, Search, X } from "lucide-react";
import { useState, useEffect } from "react";
import { AuthButton } from "../auth-button";
import { SearchCommandPalette } from "../search-command-palette";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global Cmd/Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <nav className="sticky top-0 z-50 h-14 border-b border-sx-border bg-sx-bg/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link to="/" className="font-mono text-lg font-bold">
            SKILL<span className="text-sx-accent">X</span>
          </Link>

          {/* Center: Search trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-sx-border bg-sx-bg-elevated px-3 py-1.5 text-sm text-sx-fg-muted transition-colors hover:border-sx-fg-subtle hover:text-sx-fg md:flex"
          >
            <Search size={14} />
            <span>Search skills...</span>
            <kbd className="ml-4 rounded border border-sx-border bg-sx-bg px-1.5 py-0.5 font-mono text-[10px] text-sx-fg-subtle">
              ⌘K
            </kbd>
          </button>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* Desktop nav links */}
            <Link
              to="/docs"
              className="hidden text-sm text-sx-fg-muted transition-colors hover:text-sx-fg md:block"
            >
              Docs
            </Link>
            <Link
              to="/dashboard"
              className="hidden text-sm text-sx-fg-muted transition-colors hover:text-sx-fg md:block"
            >
              Dashboard
            </Link>
            <Link
              to="/settings"
              className="hidden text-sm text-sx-fg-muted transition-colors hover:text-sx-fg md:block"
            >
              Settings
            </Link>

            {/* Mobile search */}
            <button
              onClick={() => setSearchOpen(true)}
              className="rounded-lg p-2 text-sx-fg-muted transition-colors hover:text-sx-fg md:hidden"
              aria-label="Search"
            >
              <Search size={18} />
            </button>

            <div className="hidden md:block">
              <AuthButton />
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-sx-fg-muted transition-colors hover:text-sx-fg md:hidden"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-sx-border bg-sx-bg-elevated md:hidden">
            <div className="flex flex-col space-y-1 px-4 py-3">
              <Link
                to="/docs"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-sx-fg-muted transition-colors hover:bg-sx-bg-hover hover:text-sx-fg"
              >
                Docs
              </Link>
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-sx-fg-muted transition-colors hover:bg-sx-bg-hover hover:text-sx-fg"
              >
                Profile
              </Link>
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-sx-fg-muted transition-colors hover:bg-sx-bg-hover hover:text-sx-fg"
              >
                Dashboard
              </Link>
              <Link
                to="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-sx-fg-muted transition-colors hover:bg-sx-bg-hover hover:text-sx-fg"
              >
                Settings
              </Link>
              <div className="px-3 py-2">
                <AuthButton />
              </div>
            </div>
          </div>
        )}
      </nav>

      <SearchCommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
