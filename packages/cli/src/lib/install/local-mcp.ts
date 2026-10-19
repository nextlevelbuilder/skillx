import { createInterface } from 'node:readline';
import { ADAPTERS } from './adapters.js';
import type { InstallContext } from './install-context.js';
import { InstallError } from './install-errors.js';
import { applyPlanned, listInstalled, planRefs } from './install-operations.js';
import type { SourcePlan } from './install-operations.js';
import { parseLock, planLocked } from './sync-locked.js';

/**
 * `skillx mcp`: a local MCP server over stdio (newline-delimited JSON-RPC
 * 2.0) with three tools. `inspect` and `plan` only read. `apply` changes
 * files and therefore requires `confirm: true`; with `planDigest` it also
 * refuses unless the fresh plan is exactly the one the client was shown.
 */

export interface McpContextArgs {
  runtime?: string;
  force?: boolean;
}

type Json = Record<string, unknown>;

const SOURCE_SCHEMA = {
  source: { type: 'string', description: 'kit:@handle/kit[#revisionId], collection:<id>[#n] or @publisher/package[@version] (space separated for several packages)' },
  lock: { type: 'object', description: 'a skillx.lock/v1 document to restore exactly (instead of source)' },
  runtime: { type: 'string', enum: ADAPTERS.map((a) => a.id), description: 'target runtime (default claude-code)' },
  force: { type: 'boolean', description: 'reinstall over local edits (backed up) and unowned directories' },
};

export const MCP_TOOLS = [
  { name: 'inspect', description: 'List runtimes, their skills directories, installed skills and their sources. Read-only.', inputSchema: { type: 'object', properties: { runtime: SOURCE_SCHEMA.runtime }, additionalProperties: false } },
  { name: 'plan', description: 'Resolve a source or lock and show what apply would change, with a planDigest. Read-only.', inputSchema: { type: 'object', properties: SOURCE_SCHEMA, additionalProperties: false } },
  {
    name: 'apply',
    description: 'Install or restore a source or lock. Changes files: requires confirm: true. Pass the planDigest from plan to refuse a changed plan.',
    inputSchema: {
      type: 'object',
      properties: { ...SOURCE_SCHEMA, confirm: { type: 'boolean', const: true }, planDigest: { type: 'string' } },
      required: ['confirm'],
      additionalProperties: false,
    },
  },
];

const view = (p: SourcePlan) => ({ lock: p.lock, lockDigest: p.lockDigest, planDigest: p.planDigest, warnings: p.warnings, items: p.items.map((i) => ({ owner: i.owner, ref: i.ref, plan: i.plan })) });

function planner(ctx: InstallContext, args: Json): () => Promise<SourcePlan> {
  if (args.lock !== undefined) {
    const lock = parseLock(args.lock);
    return () => planLocked(ctx, lock);
  }
  if (typeof args.source !== 'string' || args.source.trim() === '') throw new InstallError('usage_error', 'pass source or lock');
  const refs = args.source.trim().split(/\s+/);
  return () => planRefs(ctx, refs);
}

export async function callTool(name: string, args: Json, makeContext: (a: McpContextArgs) => InstallContext): Promise<unknown> {
  const ctx = () => makeContext({ ...(typeof args.runtime === 'string' ? { runtime: args.runtime } : {}), force: args.force === true });
  if (name === 'inspect') {
    const c = ctx();
    return { runtimes: ADAPTERS.map((a) => ({ id: a.id, skillsDir: a.skillsDir(c.env) })), installed: listInstalled(c), trustedKeyIds: [...c.keys.keys()] };
  }
  if (name === 'plan') return view(await planner(ctx(), args)());
  if (name === 'apply') {
    if (args.confirm !== true) throw new InstallError('usage_error', 'apply changes files on this machine; call it again with confirm: true after the user approves the plan');
    const c = ctx();
    const outcome = await applyPlanned(c, planner(c, args), typeof args.planDigest === 'string' ? args.planDigest : undefined);
    return { ...view(outcome), applied: outcome.applied, recovered: outcome.recovered };
  }
  throw new InstallError('usage_error', `unknown tool ${name}`);
}

/** Answers one JSON-RPC message; null for notifications. */
export async function handleMessage(message: Json, makeContext: (a: McpContextArgs) => InstallContext, version: string): Promise<Json | null> {
  const id = message.id;
  if (id === undefined || id === null) return null;
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const params = (message.params ?? {}) as Json;
  switch (message.method) {
    case 'initialize':
      return reply({ protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'skillx-local', version } });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: MCP_TOOLS });
    case 'tools/call': {
      try {
        const data = await callTool(String(params.name), (params.arguments ?? {}) as Json, makeContext);
        return reply({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: false });
      } catch (error) {
        const failure = error instanceof InstallError ? { code: error.code, message: error.message, details: error.details } : { code: 'unexpected_error', message: error instanceof Error ? error.message : String(error) };
        return reply({ content: [{ type: 'text', text: JSON.stringify({ error: failure }, null, 2) }], structuredContent: { error: failure }, isError: true });
      }
    }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${String(message.method)}` } };
  }
}

/** Serves MCP on stdin/stdout until stdin closes. Logs never go to stdout. */
export function serveStdio(makeContext: (a: McpContextArgs) => InstallContext, version: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let queue = Promise.resolve();
  rl.on('line', (line) => {
    if (line.trim() === '') return;
    queue = queue.then(async () => {
      let message: Json;
      try {
        message = JSON.parse(line) as Json;
      } catch {
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })}\n`);
        return;
      }
      const answer = await handleMessage(message, makeContext, version);
      if (answer !== null) process.stdout.write(`${JSON.stringify(answer)}\n`);
    });
  });
  return new Promise((resolve) => rl.on('close', () => void queue.then(() => resolve())));
}
