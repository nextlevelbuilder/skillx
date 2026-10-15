/**
 * Route table invariants for the agent-facing URLs.
 *
 * React Router only supports whole dynamic segments (`:slug`), not partial ones
 * (`:slug.md`). A partial pattern happens to match on some versions, which is
 * exactly why it is worth pinning: the `.md` documents are dispatched by
 * `matchSkillMarkdownPath` in the worker entry, and the route table keeps only
 * supported patterns.
 */

import { describe, expect, it } from "vitest";
import { matchRoutes } from "react-router";
import routes from "./routes";
import { matchSkillMarkdownPath } from "~/lib/markdown/skill-markdown-handler";

interface ConfigRoute {
  path?: string;
  file: string;
  index?: boolean;
  children?: ConfigRoute[];
}

const table = routes as unknown as ConfigRoute[];

function fileFor(pathname: string): string | undefined {
  const matches = matchRoutes(table as never, pathname);
  return (matches?.at(-1)?.route as ConfigRoute | undefined)?.file;
}

describe("route table", () => {
  it("declares no partial dynamic segment", () => {
    const partial = table
      .flatMap((route) => (route.path ?? "").split("/"))
      .filter((segment) => segment.includes(":") && !/^:[\w-]+\??$/.test(segment));
    expect(partial).toEqual([]);
  });

  it("routes the HTML skill page and the agent text documents", () => {
    expect(fileFor("/skills/find-skills")).toBe("routes/skill-detail.tsx");
    expect(fileFor("/llms.txt")).toBe("routes/llms-txt.ts");
    expect(fileFor("/llms-full.txt")).toBe("routes/llms-full-txt.ts");
    expect(fileFor("/api/mcp")).toBe("routes/api.mcp.ts");
  });

  it("leaves the Markdown skill document to the worker-level matcher", () => {
    // The worker answers this path before React Router sees it.
    expect(matchSkillMarkdownPath("/skills/find-skills.md")).toBe("find-skills");
    expect(table.some((route) => route.file.includes("skill-markdown"))).toBe(false);
  });
});
