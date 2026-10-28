/**
 * Shared shell of the policy pages (privacy, terms, support): the docs-page look
 * with a visible "Last updated" date, so a reviewer can tell which version they read.
 */

import type { ReactNode } from "react";
import { Link } from "react-router";
import { PageContainer } from "../layout/page-container";

/** Date of the current text of the privacy policy, terms, and support page. */
export const LEGAL_LAST_UPDATED = "2026-10-28";

export const SUPPORT_ISSUES_URL = "https://github.com/nextlevelbuilder/skillx/issues";
export const SECURITY_ADVISORY_URL = "https://github.com/nextlevelbuilder/skillx/security/advisories/new";

const LEGAL_LINKS = [
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms of Service" },
  { to: "/support", label: "Support" },
] as const;

interface LegalPageProps {
  title: string;
  intro: ReactNode;
  children: ReactNode;
}

export function LegalPage({ title, intro, children }: LegalPageProps) {
  return (
    <PageContainer>
      <nav aria-label="Policies" className="mb-8 flex flex-wrap gap-1 rounded-lg border border-sx-border bg-sx-bg-elevated p-1">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="rounded-md px-4 py-2 font-mono text-sm text-sx-fg-muted transition-colors hover:text-sx-fg">
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="mb-8">
        <h1 className="font-mono text-3xl font-bold">{title}</h1>
        <p className="mt-2 font-mono text-xs text-sx-fg-subtle">Last updated: {LEGAL_LAST_UPDATED}</p>
        <div className="mt-4 text-sx-fg-muted">{intro}</div>
      </div>
      <div className="space-y-6">{children}</div>
    </PageContainer>
  );
}

interface LegalSectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

export function LegalSection({ id, title, children }: LegalSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="rounded-lg border border-sx-border bg-sx-bg-elevated p-6">
      <h2 id={`${id}-title`} className="mb-4 font-mono text-xl font-semibold">
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-sx-fg-muted [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_strong]:text-sx-fg">
        {children}
      </div>
    </section>
  );
}

/** External link styled like the docs pages' accent links. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-sx-accent hover:underline">
      {children}
    </a>
  );
}
