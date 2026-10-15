/**
 * Remote read-only MCP server.
 *
 * `POST /api/mcp` speaks JSON-RPC 2.0 over the MCP streamable-HTTP transport.
 * Implemented: `initialize`, `notifications/initialized`, `tools/list`,
 * `tools/call`. Everything else is answered with `method not found` rather than
 * being stubbed, so a client can see exactly what this server does.
 *
 * Two protocol rules are enforced here rather than in the tool layer:
 *   - a request with no `id` is a notification and is answered with 202 and no
 *     body; replying to one is a protocol violation.
 *   - the tool handlers are thin adapters over the same executors as the HTTP
 *     API and the CLI, so MCP cannot drift from them.
 *
 * Cost guards: a body above `MAX_MCP_BODY_BYTES` is refused with 413 before it
 * is parsed, and every request is counted per client IP on the existing
 * `RELEASE_READ_LIMITER` binding (under its own `mcp:` key, so it does not
 * share a bucket with release reads). Like the release read API, a missing or
 * failing binding lets the request through: the limit protects cost, not
 * confidentiality.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticateRequest } from "~/lib/auth/authenticate-request";
import { checkReleaseRateLimit, rateLimitCaller } from "~/lib/releases/release-rate-limit";
import { readBoundedBody, MAX_MCP_BODY_BYTES } from "~/lib/mcp/request-body";
import { callTool, TOOL_DEFINITIONS } from "~/lib/mcp/tools";
import {
  MCP_PROTOCOL_VERSION,
  RPC,
  SERVER_NAME,
  SERVER_VERSION,
  isNotification,
  normalizeId,
  parseRequest,
  rpcError,
  rpcResult,
} from "~/lib/mcp/protocol";

/**
 * No CORS headers on purpose. MCP clients are not browsers, and the WebMCP layer
 * (task 8) runs in-page on this same origin, so nothing in scope needs
 * cross-origin access. Opening it up would only widen the surface, and a
 * wildcard with `Allow-Credentials` is exactly the mistake worth not making
 * later, so this endpoint stays same-origin.
 */
const JSON_HEADERS = { "Content-Type": "application/json" };

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Env;

  const limit = await checkReleaseRateLimit(env.RELEASE_READ_LIMITER, `mcp:${rateLimitCaller(request, null)}`);
  if (!limit.allowed) {
    return Response.json(rpcError(null, RPC.rateLimited, "Too many requests"), {
      status: 429,
      headers: { ...JSON_HEADERS, "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const body = await readBoundedBody(request);
  if (!body.ok) {
    return body.reason === "too_large"
      ? Response.json(
          rpcError(null, RPC.invalidRequest, "Request body too large", { maxBytes: MAX_MCP_BODY_BYTES }),
          { status: 413, headers: JSON_HEADERS },
        )
      : Response.json(rpcError(null, RPC.parseError, "Could not read request body"), {
          status: 400,
          headers: JSON_HEADERS,
        });
  }

  const parsed = parseRequest(body.text);
  if ("failure" in parsed) {
    return Response.json(parsed.failure, { status: 400, headers: JSON_HEADERS });
  }

  const { request: rpc } = parsed;
  const id = normalizeId(rpc.id);

  // A notification is never answered. `initialized` is the only one defined here.
  if (isNotification(rpc)) {
    return new Response(null, { status: 202, headers: JSON_HEADERS });
  }

  const userId = (await authenticateRequest(request, env))?.userId ?? null;

  switch (rpc.method) {
    case "initialize":
      return Response.json(
        rpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions:
            "Read-only SkillX catalog. Compatibility statuses: `declared` is a publisher claim, " +
            "`verified` is evidence bound to an artifact digest, and `unknown` is the absence of " +
            "a claim — never read `unknown` as support.",
        }),
        { headers: JSON_HEADERS },
      );

    case "tools/list":
      return Response.json(
        rpcResult(id, { tools: TOOL_DEFINITIONS }),
        { headers: JSON_HEADERS },
      );

    case "tools/call": {
      const params = (rpc.params ?? {}) as { name?: unknown; arguments?: unknown };
      if (typeof params.name !== "string" || params.name.length === 0) {
        return Response.json(
          rpcError(id, RPC.invalidParams, "tools/call requires a string `name`"),
          { headers: JSON_HEADERS },
        );
      }
      const result = await callTool(params.name, params.arguments, { env, userId });
      return Response.json(rpcResult(id, result), { headers: JSON_HEADERS });
    }

    default:
      return Response.json(
        rpcError(id, RPC.methodNotFound, "Method not found", {
          supportedMethods: ["initialize", "tools/list", "tools/call"],
        }),
        { status: 404, headers: JSON_HEADERS },
      );
  }
}

/**
 * This server does not open a server-initiated SSE stream, so GET is refused with
 * the reason instead of returning an empty 200 that a client would wait on.
 */
export function loader(_args: LoaderFunctionArgs) {
  return Response.json(
    {
      error: "This MCP endpoint is POST-only and does not open a server-sent event stream.",
      transport: "streamable-http",
      protocolVersion: MCP_PROTOCOL_VERSION,
    },
    { status: 405, headers: { ...JSON_HEADERS, Allow: "POST" } },
  );
}
