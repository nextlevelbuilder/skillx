/**
 * OpenAI plugin portal domain verification.
 *
 * Before the portal connects to the SkillX MCP server it fetches
 * `/.well-known/openai-apps-challenge` on the MCP hostname and expects the exact
 * token it issued, as plain text and nothing else. The token comes from the
 * `OPENAI_APPS_CHALLENGE` secret; without it the path is a plain 404, so the
 * route never answers with a guessable or empty token.
 */

export function loader({ context }: { context: { cloudflare: { env: Env } } }) {
  const token = (context.cloudflare.env.OPENAI_APPS_CHALLENGE ?? "").trim();
  if (!token) return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
  return new Response(token, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
