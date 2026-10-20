import { CliError, type CliErrorCode } from '../output.js';

/**
 * A classified installer failure. `code` is an envelope error code, so a
 * command maps it to its exit code without parsing the message; `details`
 * is machine-readable context (never file contents or credentials).
 */
export class InstallError extends CliError {
  constructor(
    code: CliErrorCode,
    message: string,
    readonly details?: unknown,
    hint?: string,
  ) {
    super(code, message, { ...(details === undefined ? {} : { details }), ...(hint ? { hint } : {}) });
    this.name = 'InstallError';
  }
}

export const usageError = (message: string, details?: unknown) => new InstallError('usage_error', message, details);
/** Bytes, signatures or digests do not match what was pinned. Nothing is written. */
export const integrityError = (message: string, details?: unknown) => new InstallError('integrity_error', message, details);
/** Local state blocks the change (modified, unowned or shared files); nothing is written. */
export const conflictError = (message: string, details?: unknown) => new InstallError('conflict', message, details);
export const incompatibleError = (message: string, details?: unknown) => new InstallError('incompatible', message, details);
