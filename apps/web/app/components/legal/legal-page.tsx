import { PageContainer } from "../layout/page-container";

/** One block of a policy page: a heading, then paragraphs and/or a bullet list. */
export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

interface LegalPageProps {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

/**
 * Shared layout for the privacy, terms and support pages. They are plain text on
 * purpose: the OpenAI plugin portal and reviewers fetch these URLs, so the policy
 * must be readable from the server-rendered HTML without running any script.
 */
export function LegalPage({ title, updated, intro, sections }: LegalPageProps) {
  return (
    <PageContainer>
      <article className="mx-auto max-w-3xl">
        <h1 className="font-mono text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-xs text-sx-fg-subtle">Last updated {updated}</p>
        <p className="mt-6 text-sx-fg-muted">{intro}</p>
        {sections.map((section) => (
          <section key={section.heading} className="mt-10">
            <h2 className="font-mono text-xl font-semibold">{section.heading}</h2>
            {section.paragraphs?.map((text) => (
              <p key={text} className="mt-3 text-sm leading-relaxed text-sx-fg-muted">
                {text}
              </p>
            ))}
            {section.items && (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-sx-fg-muted">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>
    </PageContainer>
  );
}

/** Where users report problems and send privacy requests. */
export const SUPPORT_ISSUES_URL = "https://github.com/nextlevelbuilder/skillx/issues";
