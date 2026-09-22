/**
 * Mounts the WebMCP read tools for the page.
 *
 * Renders nothing and is inert on browsers without the API: WebMCP is a
 * progressive enhancement, so the site must behave identically when it is
 * absent. Registration happens once per mount, and the outcome is only logged
 * when it actually succeeded — logging "registered" for a failed registration
 * would hide the failure.
 */

import { useEffect } from "react";
import { registerWebMcpTools } from "~/lib/webmcp/model-context";
import { createReadTools } from "~/lib/webmcp/read-tools";

export function WebMcpBridge() {
  useEffect(() => {
    const nav = globalThis.navigator as (Navigator & { modelContext?: unknown }) | undefined;
    if (!nav) return;

    const outcome = registerWebMcpTools(nav, createReadTools({ fetchImpl: fetch }));
    if (outcome === "registered") {
      console.debug("WebMCP: read tools registered");
    }
  }, []);

  return null;
}
