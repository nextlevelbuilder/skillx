/**
 * Privacy, terms, and support pages: registered ahead of the catch-all, carry
 * a title and description, show the last-updated date, and render the sections
 * an AI-plugin review requires.
 */

import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, type MetaDescriptor } from "react-router";
import { describe, expect, it } from "vitest";
import routes from "../routes";
import { LEGAL_LAST_UPDATED } from "~/components/legal/legal-page";
import Privacy, { meta as privacyMeta } from "./privacy";
import Terms, { meta as termsMeta } from "./terms";
import Support, { meta as supportMeta } from "./support";

type Meta = (args: never) => MetaDescriptor[] | undefined;

function render(page: ComponentType): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(page)));
}

function metaOf(meta: Meta): { title?: string; description?: string } {
  const tags = meta({} as never) ?? [];
  const title = tags.find((t): t is { title: string } => "title" in t)?.title;
  const description = tags.find((t): t is { name: string; content: string } => "name" in t && t.name === "description")?.content;
  return { title, description };
}

const PAGES = [
  { path: "privacy", file: "routes/privacy.tsx", page: Privacy, meta: privacyMeta as Meta, title: "Privacy Policy" },
  { path: "terms", file: "routes/terms.tsx", page: Terms, meta: termsMeta as Meta, title: "Terms of Service" },
  { path: "support", file: "routes/support.tsx", page: Support, meta: supportMeta as Meta, title: "Support" },
] as const;

describe.each(PAGES)("/$path", ({ path, file, page, meta, title }) => {
  it("is registered before the catch-all", () => {
    const index = routes.findIndex((r) => r.path === path);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(routes[index].file).toBe(file);
    expect(index).toBeLessThan(routes.findIndex((r) => r.path === "*"));
  });

  it("has a title and description", () => {
    const { title: metaTitle, description } = metaOf(meta);
    expect(metaTitle).toBe(`${title} — SkillX.sh`);
    expect(description?.length).toBeGreaterThan(40);
  });

  it("renders its heading and the last-updated date", () => {
    const html = render(page);
    expect(html).toContain(`<h1 class="font-mono text-3xl font-bold">${title}</h1>`);
    expect(html).toContain(`Last updated: ${LEGAL_LAST_UPDATED}`);
    expect(LEGAL_LAST_UPDATED).toBe("2026-10-28");
  });
});

describe("privacy policy content", () => {
  const html = render(Privacy);

  it.each([
    "Personal data we collect",
    "How we use it",
    "Who receives it",
    "AI assistants",
    "How long we keep it",
    "Your choices and controls",
  ])("covers %s", (heading) => {
    expect(html).toContain(heading);
  });

  it("states the facts the code enforces", () => {
    expect(html).toContain("SHA-256 hash");
    expect(html).toContain("does not receive your conversation");
    expect(html).toContain("Cloudflare");
    expect(html).toContain("GitHub");
  });
});

describe("support page content", () => {
  const html = render(Support);

  it("links the issue tracker, private security reports, and the docs", () => {
    expect(html).toContain("https://github.com/nextlevelbuilder/skillx/issues");
    expect(html).toContain("https://github.com/nextlevelbuilder/skillx/security/advisories/new");
    for (const href of ["/docs", "/docs/agents", "/docs/api"]) expect(html).toContain(`href="${href}"`);
  });
});

describe("terms content", () => {
  it("says scan labels and popularity are not endorsements of safety", () => {
    const html = render(Terms);
    expect(html).toContain("signal, not a");
    expect(html).toContain("Popularity is not");
  });
});
