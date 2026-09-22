/**
 * WebMCP feature detection and registration.
 *
 * WebMCP is a draft browser API, so nothing here assumes it exists and nothing
 * requires it: the site is fully functional when `navigator.modelContext` is
 * absent. Detection checks the shape of the object rather than trusting
 * presence, because a partially implemented or renamed draft API must fall back
 * to "unavailable" instead of throwing inside a page effect.
 *
 * Registration reports what actually happened. A registration that throws is
 * reported as `failed`, never as `registered`, since claiming success for a
 * rejected registration would make the failure invisible.
 */

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ModelContextLike {
  provideContext?: (context: { tools: unknown[] }) => void;
  registerTool?: (tool: unknown) => void;
}

export interface NavigatorLike {
  modelContext?: unknown;
}

export type RegistrationOutcome = "registered" | "unavailable" | "failed";

/** Returns the model context when the API looks usable, otherwise null. */
export function getModelContext(nav: NavigatorLike | undefined): ModelContextLike | null {
  const context = nav?.modelContext;
  if (typeof context !== "object" || context === null) return null;

  const candidate = context as ModelContextLike;
  const usable =
    typeof candidate.provideContext === "function" || typeof candidate.registerTool === "function";
  return usable ? candidate : null;
}

export function isWebMcpAvailable(nav: NavigatorLike | undefined): boolean {
  return getModelContext(nav) !== null;
}

/**
 * Registers the read tools with the page's model context.
 *
 * Prefers the batch `provideContext({ tools })` form and falls back to
 * `registerTool` per tool for narrower implementations. Never throws: the caller
 * is a page effect, and a draft API failing must not break rendering.
 */
export function registerWebMcpTools(
  nav: NavigatorLike | undefined,
  tools: WebMcpTool[],
): RegistrationOutcome {
  const context = getModelContext(nav);
  if (!context) return "unavailable";
  if (tools.length === 0) return "registered";

  try {
    if (typeof context.provideContext === "function") {
      context.provideContext({ tools });
      return "registered";
    }
    if (typeof context.registerTool === "function") {
      for (const tool of tools) context.registerTool(tool);
      return "registered";
    }
    return "unavailable";
  } catch (error) {
    console.error("WebMCP tool registration failed:", error);
    return "failed";
  }
}
