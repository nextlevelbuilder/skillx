/**
 * MCP tool registry.
 *
 * The handler bodies live in `handlers-packages.ts` and `handlers-kits.ts`; this
 * module only names them, so `ToolName` is the single list of what the server can
 * do. `tools.ts` asserts that every advertised tool has an entry here, which is
 * what stops a tool from being listed and then refusing to run.
 */

import { searchPackages, getPackage, getRelease, checkCompatibility } from "./handlers-packages";
import { getKit } from "./handlers-kits";

export type ToolName =
  | "search_packages"
  | "get_package"
  | "get_release"
  | "check_compatibility"
  | "get_kit";

export interface ToolContext {
  env: Env;
  userId?: string | null;
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

export const HANDLERS: Record<ToolName, ToolHandler> = {
  search_packages: (args, ctx) => searchPackages(args, ctx),
  get_package: (args, ctx) => getPackage(args, ctx),
  get_release: (args, ctx) => getRelease(args, ctx),
  check_compatibility: (args, ctx) => checkCompatibility(args, ctx),
  get_kit: (args, ctx) => getKit(args, ctx),
};
