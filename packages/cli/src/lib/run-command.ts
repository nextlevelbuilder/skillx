/**
 * One way for a command to finish.
 *
 * Every command reports through `runCommand`, so `--json` always yields one
 * envelope on stdout and the exit code always follows `output.ts`. Human text
 * stays the default. The exit code is set on `process.exitCode` instead of
 * calling `process.exit`, so piped stdout drains and fire-and-forget requests
 * (install tracking) are not cut off.
 */

import chalk from 'chalk';
import ora from 'ora';
import { CommanderError, type Command } from 'commander';
import {
  EXIT_CODES,
  exitCodeFor,
  failure,
  fromError,
  serialize,
  success,
  type CliEnvelope,
  type CliFailure,
  type ErrorContext,
  type ExitCode,
} from './output.js';

export interface RunOptions<T> {
  /** `--json` was passed: print the envelope instead of human text. */
  json: boolean;
  /** Spinner text shown in human mode while the task runs. */
  spinner?: string;
  /** Exit code for a successful result, when success is not always 0 (e.g. `check`). */
  exitCode?: (data: T) => ExitCode;
  /** Wording for errors whose subject varies by command. */
  errors?: ErrorContext;
}

/** Writes an envelope (or human text) and sets the exit code. */
export function emit<T>(
  envelope: CliEnvelope<T>,
  json: boolean,
  human: (data: T) => void,
  exitCode?: ExitCode,
): void {
  if (json) console.log(serialize(envelope));
  else if (envelope.ok) human(envelope.data);
  else printFailure(envelope);
  process.exitCode = exitCode ?? exitCodeFor(envelope);
}

/** Human rendering of a failure: the message, then the hint when there is one. */
export function printFailure(envelope: CliFailure): void {
  console.error(chalk.red(`\n✗ ${envelope.error.message}`));
  if (envelope.error.hint) console.error(chalk.dim(envelope.error.hint));
}

/**
 * Runs a command body and reports its result.
 *
 * `task` returns the data that becomes `envelope.data`; throwing (a `CliError`,
 * an `ApiError`, anything) becomes a failure envelope. `human` renders the same
 * data as text, so both modes describe one result. A human renderer may itself
 * continue into further requests (`search --use`); its failure is reported the
 * same way.
 */
export async function runCommand<T>(
  options: RunOptions<T>,
  task: (progress: (text: string) => void) => Promise<T>,
  human: (data: T) => void | Promise<void>,
): Promise<void> {
  const spinner = !options.json && options.spinner ? ora(options.spinner).start() : null;
  const progress = (text: string) => {
    if (spinner) spinner.text = text;
  };

  let envelope: CliEnvelope<T>;
  try {
    envelope = success(await task(progress));
  } catch (error) {
    envelope = fromError(error, options.errors);
  } finally {
    spinner?.stop();
  }

  const code = envelope.ok && options.exitCode ? options.exitCode(envelope.data) : undefined;
  if (options.json || !envelope.ok) {
    emit(envelope, options.json, () => {}, code);
    return;
  }
  try {
    await human(envelope.data);
    process.exitCode = code ?? EXIT_CODES.ok;
  } catch (error) {
    emit(fromError(error, options.errors), false, () => {});
  }
}

/**
 * Commander exits 1 on every parse problem. A caller has to tell "you called me
 * wrong" (2) from a failed run (1), and with `--json` it expects an envelope on
 * stdout, so parse errors are routed through the same vocabulary. Help and
 * `--version` still exit 0.
 */
export function routeUsageErrors(program: Command, argv: readonly string[] = process.argv): void {
  const json = argv.includes('--json');
  const apply = (command: Command) => {
    command.exitOverride((error: CommanderError) => {
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
        process.exit(EXIT_CODES.ok);
      }
      const envelope = failure('usage_error', error.message.replace(/^error:\s*/, ''), {
        details: { reason: error.code },
        hint: 'Run `skillx --help` or `skillx <command> --help`.',
      });
      if (json) console.log(serialize(envelope));
      process.exit(EXIT_CODES.usage);
    });
    command.commands.forEach(apply);
  };
  apply(program);
}
