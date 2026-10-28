/**
 * The catch-all route must answer unknown paths with HTTP 404, not 200, while
 * still rendering the Not Found page.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import NotFound, { loader } from "./$";

describe("catch-all route", () => {
  it("sets HTTP 404 on its loader data", () => {
    const result = loader() as unknown as { type: string; init: ResponseInit | null; data: unknown };
    expect(result.type).toBe("DataWithResponseInit");
    expect(result.init?.status).toBe(404);
    expect(result.data).toBeNull();
  });

  it("still renders the Not Found page", () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(NotFound)));
    expect(html).toContain("Page Not Found");
    expect(html).toContain('href="/"');
  });
});
