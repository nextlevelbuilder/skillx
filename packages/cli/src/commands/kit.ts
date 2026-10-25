import { Command } from 'commander';
import chalk from 'chalk';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { kitApi } from '../lib/kit-api.js';
import { withCliErrors } from '../lib/api-errors.js';
import { runCommand, usageError } from '../lib/release-cli.js';

/*
 * Personal kit authoring over an API key (`kits:write:@<handle>`, or an
 * unscoped key). There is deliberately no review command: reviewing a
 * proposal, and activating a public revision, need the owner's interactive web
 * session, so the server answers an API key with `kit.interactive_approval_required`.
 */

const KIT = /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9._-]{0,63}$/;

export function parseKit(raw: string): string {
  if (!KIT.test(raw)) throw usageError(`expected a kit as @handle/name, got ${JSON.stringify(raw)}`);
  return raw;
}

/** `3`, `g3` and the ETag forms `"g3"` / `W/"g3"` all name generation 3. */
export function parseGeneration(raw: string | undefined, flag = '--if-match'): number {
  const match = /^(?:W\/)?"?g?(\d+)"?$/.exec((raw ?? '').trim());
  if (!match) throw usageError(`${flag} must be a kit generation such as 3 or "g3" (see \`skillx kit show\`)`);
  const generation = Number(match[1]);
  if (!Number.isSafeInteger(generation)) throw usageError(`${flag} is not a valid generation`);
  return generation;
}

function requireDigest(digest: string | undefined): string {
  if (digest === undefined || digest.trim() === '') {
    throw usageError('--digest <revision digest> is required: activation is bound to the exact digest you reviewed (see `skillx kit revision`)');
  }
  return digest.trim();
}

/** A personal-kit document is a small JSON manifest; refuse anything larger before reading it. */
const MAX_DOCUMENT_BYTES = 1024 * 1024;

async function readDocument(file: string | undefined): Promise<{ document: unknown; raw: string }> {
  if (!file) throw usageError('--document <file> is required');
  let raw: string;
  try {
    const size = (await stat(file)).size;
    if (size > MAX_DOCUMENT_BYTES) throw new Error(`larger than ${MAX_DOCUMENT_BYTES} bytes`);
    raw = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '');
  } catch (error) {
    throw usageError(`cannot read --document ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return { document: JSON.parse(raw) as unknown, raw };
  } catch {
    throw usageError(`--document ${file} is not valid JSON`);
  }
}

export interface PushOptions {
  document?: string;
  ifMatch?: string;
  idempotencyKey?: string;
}

export interface ActivateOptions {
  digest?: string;
  ifMatch?: string;
}

export const runKitShow = (kit: string) => withCliErrors(() => kitApi.get(parseKit(kit)));
export const runKitRevisions = (kit: string) => withCliErrors(() => kitApi.revisions(parseKit(kit)));
export const runKitRevision = (kit: string, revisionId: string) => withCliErrors(() => kitApi.revision(parseKit(kit), revisionId));
export const runKitLock = (kit: string, options: { revision?: string }) => withCliErrors(() => kitApi.lock(parseKit(kit), options.revision));

/**
 * Stores a `draft` revision (`POST /revisions`) guarded by `If-Match`; a stale
 * generation is the `conflict` error with `details.code` `kit.generation_conflict`.
 * The default idempotency key derives from the kit, generation and document, so
 * a retry after a lost answer replays instead of failing as stale.
 */
export async function runKitPush(kit: string, options: PushOptions) {
  parseKit(kit);
  const generation = parseGeneration(options.ifMatch);
  const { document, raw } = await readDocument(options.document);
  const key = options.idempotencyKey ?? `cli-${createHash('sha256').update(`${kit}\0${generation}\0${raw}`).digest('hex').slice(0, 48)}`;
  return withCliErrors(() => kitApi.storeRevision(kit, document, generation, key, 'if-match'));
}

/**
 * Activates (or rolls back to) a revision. `--digest` is mandatory: the user
 * approves one exact digest. Without `--if-match` the current generation is
 * read first; the digest still pins what becomes effective.
 */
export async function runKitActivate(kit: string, revisionId: string, options: ActivateOptions, rollback = false) {
  parseKit(kit);
  const digest = requireDigest(options.digest);
  const expected = options.ifMatch === undefined ? undefined : parseGeneration(options.ifMatch);
  return withCliErrors(async () => {
    const generation = expected ?? (await kitApi.get(kit)).generation;
    return kitApi.activate(kit, { id: revisionId, digest }, generation, rollback, 'if-match');
  });
}

const json = '--json';
const jsonHelp = 'print the result as a JSON envelope';

const kitCommand = new Command('kit').description('Personal kits: inspect revisions and push, activate, roll back (needs a kits:write:@<handle> key)');

kitCommand
  .command('show')
  .description('Kit summary: generation, effective revision')
  .argument('<kit>', '@handle/name')
  .option(json, jsonHelp)
  .action(async (kit: string, options: { json?: boolean }) => {
    await runCommand('kit show', options.json, () => runKitShow(kit), (data) => {
      console.log(chalk.bold(data.kit ?? kit));
      console.log(`  generation: ${chalk.cyan(String(data.generation))}`);
      console.log(`  effective:  ${data.effectiveRevision ? `${data.effectiveRevision.id} (r${data.effectiveRevision.number}) ${data.effectiveRevision.digest}` : chalk.dim('none')}`);
    });
  });

kitCommand
  .command('revisions')
  .description('List a kit\'s revisions')
  .argument('<kit>', '@handle/name')
  .option(json, jsonHelp)
  .action(async (kit: string, options: { json?: boolean }) => {
    await runCommand('kit revisions', options.json, () => runKitRevisions(kit), (data) => {
      for (const r of data.revisions) console.log(`r${r.number}  ${chalk.cyan(r.id)}  ${r.state}  ${r.origin}  ${chalk.dim(r.digest)}`);
      if (data.revisions.length === 0) console.log(chalk.dim('No revisions.'));
    });
  });

kitCommand
  .command('revision')
  .description('One revision with its document')
  .argument('<kit>', '@handle/name')
  .argument('<id>', 'revision id')
  .option(json, jsonHelp)
  .action(async (kit: string, id: string, options: { json?: boolean }) => {
    await runCommand('kit revision', options.json, () => runKitRevision(kit, id), (data) => {
      console.log(`r${data.number}  ${chalk.cyan(data.id)}  ${data.state}  ${chalk.dim(data.digest)}`);
      console.log(JSON.stringify(data.document, null, 2));
    });
  });

kitCommand
  .command('push')
  .description('Store a document as a new draft revision, guarded by the generation you read')
  .argument('<kit>', '@handle/name')
  .requiredOption('--document <file>', 'skillx.personal-kit/v1 JSON document')
  .requiredOption('--if-match <generation>', 'the kit generation you based the document on (3, g3 or "g3"; 0 for a new kit)')
  .option('--idempotency-key <key>', 'retry key (default: derived from kit, generation and document)')
  .option(json, jsonHelp)
  .action(async (kit: string, options: PushOptions & { json?: boolean }) => {
    await runCommand('kit push', options.json, () => runKitPush(kit, options), (data) => {
      console.log(chalk.bold.green(`${data.replayed ? 'Replayed' : 'Stored'} r${data.revision.number} (${data.revision.id}), generation ${data.generation}`));
      console.log(`  digest: ${chalk.cyan(data.revision.digest)}`);
      for (const warning of data.warnings) console.log(chalk.yellow(`  warning: ${warning}`));
    });
  });

for (const [name, rollback, summary] of [
  ['activate', false, 'Make a revision effective (bound to the digest you reviewed)'],
  ['rollback', true, 'Re-activate an earlier effective revision (bound to its digest)'],
] as const) {
  kitCommand
    .command(name)
    .description(summary)
    .argument('<kit>', '@handle/name')
    .argument('<revisionId>', 'revision id')
    .option('--digest <digest>', 'exact revision digest you approve (required)')
    .option('--if-match <generation>', 'expected kit generation (default: the current one)')
    .option(json, jsonHelp)
    .action(async (kit: string, revisionId: string, options: ActivateOptions & { json?: boolean }) => {
      await runCommand(`kit ${name}`, options.json, () => runKitActivate(kit, revisionId, options, rollback), (data) => {
        console.log(chalk.bold.green(`${kit}: effective revision is now ${data.effectiveRevisionId} (generation ${data.generation})`));
        for (const warning of data.warnings) console.log(chalk.yellow(`  warning: ${warning}`));
      });
    });
}

kitCommand
  .command('lock')
  .description('The lock of the effective (or a named) revision')
  .argument('<kit>', '@handle/name')
  .option('--revision <id>', 'revision id (default: effective)')
  .option(json, jsonHelp)
  .action(async (kit: string, options: { revision?: string; json?: boolean }) => {
    await runCommand('kit lock', options.json, () => runKitLock(kit, options), (data) => {
      console.log(JSON.stringify(data.lock, null, 2));
      for (const warning of data.warnings) console.log(chalk.yellow(`warning: ${warning}`));
    });
  });

export { kitCommand };
