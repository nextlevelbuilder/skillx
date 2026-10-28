/**
 * MCP tool registry.
 *
 * The handler bodies live in `handlers-packages.ts`, `handlers-releases.ts`, `handlers-kits.ts` and `handlers-install.ts`; this
 * module only names them, so `ToolName` is the single list of what the server can
 * do. `tools.ts` asserts that every advertised tool has an entry here, which is
 * what stops a tool from being listed and then refusing to run.
 */

import { searchPackages, getPackage, checkCompatibility } from "./handlers-packages";
import { getRelease } from "./handlers-releases";
import { getKit } from "./handlers-kits";
import { prepareInstall } from "./handlers-install";

export type ToolName =
  | "search_packages"
  | "get_package"
  | "get_release"
  | "check_compatibility"
  | "get_kit"
  | "prepare_install";

export interface ToolContext {
  env: Env;
  /** The authenticated caller; the route sets it for `get_kit` only, every other tool runs anonymous. */
  userId?: string | null;
  /** Origin of the request, so links a host shows a person are absolute. */
  origin?: string;
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

export const HANDLERS: Record<ToolName, ToolHandler> = {
  search_packages: (args, ctx) => searchPackages(args, ctx),
  get_package: (args, ctx) => getPackage(args, ctx),
  get_release: (args, ctx) => getRelease(args, ctx),
  check_compatibility: (args, ctx) => checkCompatibility(args, ctx),
  get_kit: (args, ctx) => getKit(args, ctx),
  prepare_install: (args, ctx) => prepareInstall(args, ctx),
};
