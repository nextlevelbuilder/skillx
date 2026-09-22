/**
 * Argument readers for MCP tools.
 *
 * Handlers validate fields rather than shapes: a non-object `arguments` value is
 * normalized to `{}` by `asRecord`, so every reader here has one job — accept a
 * usable value or throw `ToolInputError`, which the dispatcher turns into a
 * tool-level error result instead of a transport failure.
 */

import { ToolInputError } from "./protocol";

export function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ToolInputError(`${key} is required and must be a non-empty string`);
  }
  return value.trim();
}

export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function optionalLimit(args: Record<string, unknown>, fallback: number, max: number): number {
  const value = args.limit;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

/**
 * Collection members are stored as JSON. A malformed value narrows the answer to
 * a reported error rather than throwing, so one bad row cannot make the whole
 * tool unusable.
 */
export function parseMembers(membersJson: string): { members: unknown } | { membersError: string } {
  try {
    return { members: JSON.parse(membersJson) as unknown };
  } catch {
    return { membersError: "collection members are not valid JSON" };
  }
}
