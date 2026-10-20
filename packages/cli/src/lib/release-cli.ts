/**
 * Shared plumbing of the release commands (`validate`, `pack`, `publish`,
 * `promote`): the JSON envelope with standard exit codes, registry requests
 * whose failures map onto that vocabulary, and the publish credential (an API
 * key, or a GitHub Actions OIDC token exchanged for a short-lived one).
 */
import { CliError } from './output.js';
import { runCommand as runShared } from './run-command.js';
import { getApiKey } from '../utils/config-store.js';

export { CliError };

export const usageError = (message: string) => new CliError('usage_error', message);

/**
 * Runs one release command through the shared `runCommand`: with `--json`
 * stdout carries exactly one envelope, success or failure; without it `render`
 * prints for humans and errors go to stderr, prefixed with the command label.
 * The exit code follows the envelope either way.
 */
export async function runCommand<T>(label: string, json: boolean | undefined, work: () => Promise<T>, render: (data: T) => void): Promise<void> {
  await runShared({ json: json === true, failureLabel: label }, work, render);
}

const NAME_PATTERN = /^@([a-z0-9][a-z0-9._-]*)\/([a-z0-9][a-z0-9._-]*)$/;

export function parsePackageName(raw: string | undefined): { handle: string; slug: string; name: string } {
  const match = NAME_PATTERN.exec(raw ?? '');
  if (!match) throw usageError(`--name must be @publisher/slug, got ${JSON.stringify(raw ?? '')}`);
  return { handle: match[1], slug: match[2], name: raw! };
}

/** Sends one registry request and returns its JSON body, or throws the matching CliError. */
export async function registryFetch(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (error) {
    throw new CliError('network_error', `cannot reach ${new URL(url).origin}: ${error instanceof Error ? error.message : String(error)}`, {
      hint: 'Check the network connection and --registry.',
    });
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Non-JSON answers are reported with their status.
  }
  if (res.ok) return body;
  const error = body.error as { code?: string; message?: string } | undefined;
  const message = `registry answered ${res.status}${error?.code ? ` ${error.code}` : ''}: ${error?.message ?? text.slice(0, 300)}`;
  const details = { status: res.status, code: error?.code ?? null };
  if (res.status === 401 || res.status === 403) throw new CliError('auth_error', message, { details });
  if (res.status === 404) throw new CliError('not_found', message, { details });
  if (res.status === 429) throw new CliError('rate_limited', message, { details, hint: 'Retry later.' });
  throw new CliError('api_error', message, { details });
}

/** Requests a GitHub Actions OIDC token for `audience` (needs `permissions: id-token: write`). */
async function githubOidcToken(audience: string): Promise<string> {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) {
    throw new CliError('auth_error', '--oidc needs a GitHub Actions job with `permissions: id-token: write`', {
      hint: 'Outside GitHub Actions, use an API key (SKILLX_API_KEY).',
    });
  }
  const body = await registryFetch(`${url}${url.includes('?') ? '&' : '?'}audience=${encodeURIComponent(audience)}`, {
    headers: { Authorization: `bearer ${bearer}`, Accept: 'application/json' },
  });
  if (typeof body.value !== 'string') throw new CliError('auth_error', 'GitHub returned no OIDC token');
  return body.value;
}

export interface CredentialOptions {
  oidc?: boolean;
  oidcAudience?: string;
}

/** The bearer for publisher writes of `@handle`: an exchanged OIDC token with `--oidc`, else the API key. */
export async function publishCredential(base: string, handle: string, options: CredentialOptions): Promise<string> {
  if (options.oidc) {
    const idToken = await githubOidcToken(options.oidcAudience ?? 'skillx');
    const body = await registryFetch(`${base}/api/v1/oidc/github/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: idToken, publisher: `@${handle}` }),
    });
    if (typeof body.token !== 'string') throw new CliError('auth_error', 'the registry returned no publish token');
    return body.token;
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new CliError('auth_error', 'an API key is required', { hint: 'Set SKILLX_API_KEY, run `skillx config set api-key <key>`, or use --oidc in GitHub Actions.' });
  }
  return apiKey;
}
