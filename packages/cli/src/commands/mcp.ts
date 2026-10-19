import { Command } from 'commander';
import { serveStdio } from '../lib/install/local-mcp.js';
import { contextFrom } from './install-runner.js';

/** Injected at build time from packages/cli/package.json by tsup (see tsup.config.ts). */
declare const __SKILLX_VERSION__: string;

/**
 * `skillx mcp`: the local installer as an MCP server on stdio, with the
 * tools `inspect`, `plan` and `apply` (apply requires `confirm: true`).
 * This is not the remote registry MCP at `/api/mcp`.
 */
export const mcpCommand = new Command('mcp')
  .description('Serve the local installer (inspect, plan, apply) as an MCP server on stdio')
  .option('--registry <url>', 'registry base URL (default: the configured one)')
  .action(async (options: { registry?: string }) => {
    await serveStdio((args) => contextFrom({ ...options, ...args }), __SKILLX_VERSION__);
  });
