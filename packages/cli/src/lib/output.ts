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
  /** The skill exists but cannot run on the requested target. */
  incompatible: 4,
  /** Credentials are missing or rejected. */
  auth: 5,
  /** The API could not be reached. */
  network: 6,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export type CliErrorCode =
  | 'usage_error'
  | 'not_found'
  | 'incompatible'
  | 'auth_error'
  | 'network_error'
  | 'api_error'
  | 'unexpected_error';

const EXIT_BY_CODE: Record<CliErrorCode, ExitCode> = {
  usage_error: EXIT_CODES.usage,
  not_found: EXIT_CODES.notFound,
  incompatible: EXIT_CODES.incompatible,
  auth_error: EXIT_CODES.auth,
  network_error: EXIT_CODES.network,
  api_error: EXIT_CODES.error,
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

/**
 * Maps a thrown error onto the envelope vocabulary.
 *
 * A 404 is "the skill does not exist" and a 401/403 is "your credentials are
 * wrong"; both are decisions a caller makes differently, so they do not share a
 * code with a generic API failure.
 */
export function fromError(error: unknown): CliFailure {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return failure('not_found', 'The requested skill was not found.', { details: { status: 404 } });
    }
    if (error.status === 401 || error.status === 403) {
      return failure('auth_error', 'The API rejected this request as unauthenticated.', {
        details: { status: error.status },
        hint: 'Run `skillx config set apiKey <key>` or check the key has not been revoked.',
      });
    }
    return failure('api_error', error.message, { details: { status: error.status } });
  }

  if (error instanceof TypeError) {
    // `fetch` rejects with TypeError when the host cannot be reached.
    return failure('network_error', error.message, {
      hint: 'Check the network connection and the configured base URL.',
    });
  }

  if (error instanceof Error) return failure('unexpected_error', error.message);
  return failure('unexpected_error', 'An unknown error occurred.');
}

/** Serializes an envelope for stdout. */
export function serialize(envelope: CliEnvelope<unknown>): string {
  return JSON.stringify(envelope, null, 2);
}
