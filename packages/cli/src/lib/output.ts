/**
 * CLI result envelope and exit codes.
 *
 * Agents drive this CLI, so every command has to answer in a shape a program can
 * read: one envelope, one error vocabulary, and an exit code that distinguishes
 * "you called me wrong" from "the skill is not compatible" from "the network was
 * down". A caller must be able to branch without parsing human text.
 *
 * Human-readable output stays the default; `--json` selects the envelope.
 */

import { ApiError } from './api-client.js';

export const EXIT_CODES = {
  ok: 0,
  /** Unexpected failure, or a failure the API reported without a better class. */
  error: 1,
  /** The command was called with invalid input. */
  usage: 2,
  /** The skill does not exist. */
  notFound: 3,
  /**
   * The skill exists but the target may not act on it. `check` answers it on a
   * success envelope (`data.actionable: false`); the installer fails with the
   * `incompatible` error code.
   */
  incompatible: 4,
  /** Credentials are missing or rejected. */
  auth: 5,
  /** The API could not be reached. */
  network: 6,
  /** The API asked the caller to slow down; retry later. */
  rateLimited: 7,
  /** Local files block an install change (modified, unowned or shared), or a kit write used a stale generation. */
  conflict: 8,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export type CliErrorCode =
  | 'usage_error'
  | 'not_found'
  | 'incompatible'
  | 'auth_error'
  | 'network_error'
  | 'rate_limited'
  | 'api_error'
  | 'integrity_error'
  | 'conflict'
  | 'unexpected_error';

const EXIT_BY_CODE: Record<CliErrorCode, ExitCode> = {
  usage_error: EXIT_CODES.usage,
  not_found: EXIT_CODES.notFound,
  incompatible: EXIT_CODES.incompatible,
  auth_error: EXIT_CODES.auth,
  network_error: EXIT_CODES.network,
  rate_limited: EXIT_CODES.rateLimited,
  api_error: EXIT_CODES.error,
  integrity_error: EXIT_CODES.error,
  conflict: EXIT_CODES.conflict,
  unexpected_error: EXIT_CODES.error,
};

export interface CliSuccess<T> {
  ok: true;
  data: T;
}

export interface CliFailure {
  ok: false;
  error: {
    code: CliErrorCode;
    message: string;
    /** Machine-readable context, e.g. the failing target or a reason code. */
    details?: unknown;
    /** What the caller should do next, when there is a concrete action. */
    hint?: string;
  };
}

export type CliEnvelope<T> = CliSuccess<T> | CliFailure;

/**
 * A failure a command raises on purpose, already classified. Throwing one from
 * inside `runCommand` produces exactly this code, message and hint.
 */
export class CliError extends Error {
  constructor(
    readonly code: CliErrorCode,
    message: string,
    readonly extra: { details?: unknown; hint?: string } = {},
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function success<T>(data: T): CliSuccess<T> {
  return { ok: true, data };
}

export function failure(
  code: CliErrorCode,
  message: string,
  extra: { details?: unknown; hint?: string } = {},
): CliFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(extra.details !== undefined ? { details: extra.details } : {}),
      ...(extra.hint ? { hint: extra.hint } : {}),
    },
  };
}

export function exitCodeFor(envelope: CliEnvelope<unknown>): ExitCode {
  return envelope.ok ? EXIT_CODES.ok : EXIT_BY_CODE[envelope.error.code];
}

/** Per-command wording for errors whose class is fixed but whose subject varies. */
export interface ErrorContext {
  /** Replaces the generic 404 message, e.g. "Skill not found: foo". */
  notFoundMessage?: string;
  /** A hint for that 404, e.g. what to create before retrying. */
  notFoundHint?: string;
}

/**
 * Maps a thrown error onto the envelope vocabulary.
 *
 * A 404 is "the thing does not exist" and a 401/403 is "your credentials are
 * wrong"; both are decisions a caller makes differently, so they do not share a
 * code with a generic API failure.
 */
export function fromError(error: unknown, context: ErrorContext = {}): CliFailure {
  if (error instanceof CliError) return failure(error.code, error.message, error.extra);

  if (error instanceof ApiError) {
    if (error.status === 404) {
      return failure('not_found', context.notFoundMessage ?? 'The requested resource was not found.', {
        details: { status: 404 },
        ...(context.notFoundHint ? { hint: context.notFoundHint } : {}),
      });
    }
    if (error.status === 401 || error.status === 403) {
      return failure('auth_error', 'The API rejected this request as unauthenticated.', {
        details: { status: error.status },
        hint: 'Run `skillx config set-key` or set SKILLX_API_KEY, and check the key has not been revoked.',
      });
    }
    if (error.status === 429) {
      return failure('rate_limited', 'Rate limited by the API.', {
        details: { status: 429 },
        hint: 'Wait and retry.',
      });
    }
    return failure('api_error', error.message, { details: { status: error.status } });
  }

  if (isFetchFailure(error)) {
    // `fetch` rejects with TypeError when the host cannot be reached.
    return failure('network_error', error.message, {
      hint: 'Check the network connection and the configured base URL.',
    });
  }

  if (error instanceof Error) return failure('unexpected_error', error.message);
  return failure('unexpected_error', 'An unknown error occurred.');
}

/**
 * Node's fetch rejects with `TypeError('fetch failed', { cause })`. Any other
 * TypeError is a bug in the CLI and must not be reported as a network outage.
 */
function isFetchFailure(error: unknown): error is TypeError {
  return error instanceof TypeError && (error.message === 'fetch failed' || error.cause !== undefined);
}

/** Serializes an envelope for stdout. */
export function serialize(envelope: CliEnvelope<unknown>): string {
  return JSON.stringify(envelope, null, 2);
}
