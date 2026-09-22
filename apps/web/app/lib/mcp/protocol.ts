/**
 * MCP / JSON-RPC 2.0 vocabulary for the remote read-only server.
 *
 * Deliberately a subset of MCP: `initialize`, `tools/list`, `tools/call`, and
 * the `notifications/initialized` notification. The server is read-only, so
 * resources, prompts, sampling, and roots are not implemented rather than
 * half-implemented.
 *
 * Two protocol details the rest of the code depends on:
 *   - A request without an `id` is a notification and MUST NOT be answered.
 *     Replying to one is a protocol violation, so the check is centralized here.
 *   - A tool that fails at runtime is a successful JSON-RPC call whose result
 *     carries `isError: true`, not a JSON-RPC error object. Only a malformed
 *     request or an unknown method is a JSON-RPC error.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const SERVER_NAME = "skillx";
export const SERVER_VERSION = "0.1.0";

/** JSON-RPC 2.0 error codes, plus the MCP "method not found" case. */
export const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolResult {
  content: TextContent[];
  isError?: boolean;
}

/** Thrown by a handler when the caller's arguments are unusable. */
export class ToolInputError extends Error {}

/**
 * Narrows `params.arguments` to a plain object. Anything else (a list, a string,
 * `null`) becomes `{}`, so handlers validate fields rather than shapes.
 */
export function asRecord(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
}

export function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

export function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0" as const,
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

export function normalizeId(value: unknown): JsonRpcId {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

/**
 * A request with no `id` is a notification. `null` counts as absent: JSON-RPC
 * reserves `null` for responses to unparseable requests.
 */
export function isNotification(request: JsonRpcRequest): boolean {
  return request.id === undefined || request.id === null;
}

export type ParseOutcome =
  | { request: JsonRpcRequest }
  | { failure: ReturnType<typeof rpcError> };

/** Parses one JSON-RPC message, returning a JSON-RPC error instead of throwing. */
export function parseRequest(raw: string): ParseOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { failure: rpcError(null, RPC.parseError, "Parse error") };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { failure: rpcError(null, RPC.invalidRequest, "Expected a single JSON-RPC object") };
  }

  const request = parsed as JsonRpcRequest;
  if (typeof request.method !== "string" || request.method.length === 0) {
    return { failure: rpcError(normalizeId(request.id), RPC.invalidRequest, "Missing method") };
  }

  return { request };
}

/** Serializes a value as the single text content block MCP expects. */
export function textResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/**
 * A tool-level failure. Returned as a result with `isError`, because the call
 * itself succeeded and the agent needs to see why the tool declined.
 */
export function errorResult(message: string, data?: unknown): ToolResult {
  const payload = { error: message, ...(data === undefined ? {} : { details: data }) };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError: true };
}
