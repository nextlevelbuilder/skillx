import { ApiError } from './api-client.js';
import { CliError } from './output.js';

/** The `error.message` of a JSON error body, or null. */
function bodyMessage(body: string): string | null {
  try {
    const message = (JSON.parse(body) as { error?: { message?: unknown } })?.error?.message;
    return typeof message === 'string' ? message : null;
  } catch {
    return null;
  }
}

/**
 * Maps a failed library or kit request onto the envelope vocabulary and keeps
 * the server's machine-readable code in `details.code` (for example
 * `auth.scope_missing`, `kit.api_disabled`, `kit.generation_conflict`):
 * 401/403 `auth_error`, 404 `not_found`, 412 (stale `If-Match`) and a 409
 * `kit.generation_conflict` `conflict`, 429 `rate_limited`, anything else
 * `api_error`. Errors that are not API answers pass through unchanged.
 */
export function toCliError(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;
  const code = error.code;
  const details = { status: error.status, code };
  const message = bodyMessage(error.body) ?? error.message;
  const label = `${code ?? `HTTP ${error.status}`}: ${message}`;
  if (error.status === 401 || error.status === 403) {
    const keyProblem = error.status === 401 || code === null || code.startsWith('auth.');
    const hint = keyProblem
      ? 'Check SKILLX_API_KEY (`skillx config set-key`): the key needs library:read for reads and kits:write:@<handle> for kit writes.'
      : undefined;
    return new CliError('auth_error', label, hint ? { details, hint } : { details });
  }
  if (error.status === 404) return new CliError('not_found', error.name === 'KitApiDisabledError' ? error.message : label, { details });
  if (error.status === 412 || (error.status === 409 && code === 'kit.generation_conflict')) {
    return new CliError('conflict', label, { details, hint: 'The kit changed since you read it. Run `skillx kit show <kit>` for the current generation and retry.' });
  }
  if (error.status === 429) return new CliError('rate_limited', label, { details, hint: 'Retry later.' });
  return new CliError('api_error', label, { details });
}

/** Runs a request and rethrows its failure through {@link toCliError}. */
export async function withCliErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw toCliError(error);
  }
}
