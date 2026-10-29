import { spawnSync } from 'node:child_process';
import { InstallError } from '../install/install-errors.js';
import { redactCredentials } from './add-source.js';
import { exitOnSignal, isCleanupSignal } from './scratch-dirs.js';

/**
 * Runs git for `skillx add`: argument arrays (no shell), every credential
 * prompt off (`core.askPass=` plus an empty `GIT_ASKPASS`,
 * `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`), only one transport
 * allowed (`https` outside tests) so `ext::`, `file://` and `ssh` are refused
 * by git itself too, also on a redirect, a bounded output and a timeout.
 * Every message is redacted.
 *
 * A URL's credentials never reach git's argument list or `.git/config`:
 * `remoteOf` strips them and hands them over as an `Authorization` header in
 * `GIT_CONFIG_*` environment entries (`http.<origin>/.extraHeader`), so no
 * credential helper is asked to store them either. git matches that key once,
 * against the URL it was given, and then sends the header to wherever a
 * redirect leads, so redirects are turned off whenever a header is passed.
 *
 * git runs synchronously, so Ctrl+C reaches git (same process group) before
 * Node can handle it: a git call killed by SIGINT, SIGTERM or SIGHUP exits
 * the CLI as that signal would, after removing every temporary clone.
 */

export const GIT_TIMEOUT_MS = 120_000;

export type ConfigPair = readonly [key: string, value: string];

export function gitEnv(base: NodeJS.ProcessEnv = process.env, config: readonly ConfigPair[] = []): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '', SSH_ASKPASS: '', GIT_LFS_SKIP_SMUDGE: '1' };
  if (config.length === 0) return env;
  const start = Number(base.GIT_CONFIG_COUNT) > 0 ? Number(base.GIT_CONFIG_COUNT) : 0;
  config.forEach(([key, value], i) => {
    env[`GIT_CONFIG_KEY_${start + i}`] = key;
    env[`GIT_CONFIG_VALUE_${start + i}`] = value;
  });
  env.GIT_CONFIG_COUNT = String(start + config.length);
  return env;
}

/** Options that come before every git command reaching a remote. */
export const guardArgs = (transport: string): string[] => ['-c', 'core.askPass=', '-c', 'protocol.allow=never', '-c', `protocol.${transport}.allow=always`];

export interface Remote {
  /** The URL git sees, without credentials. */
  url: string;
  /** Config entries passed through the environment (the credential header, if any). */
  config: ConfigPair[];
}

const decode = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

export function remoteOf(url: string): Remote {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, config: [] };
  }
  if (parsed.username === '' && parsed.password === '') return { url, config: [] };
  const basic = Buffer.from(`${decode(parsed.username)}:${decode(parsed.password)}`, 'utf8').toString('base64');
  parsed.username = '';
  parsed.password = '';
  return {
    url: parsed.href,
    config: [
      [`http.${parsed.origin}/.extraHeader`, `Authorization: Basic ${basic}`],
      // Scoped to the whole URL: a user's URL-scoped `followRedirects` would beat a shorter key.
      [`http.${parsed.href}.followRedirects`, 'false'],
    ],
  };
}

export interface GitRun {
  input?: string;
  config?: readonly ConfigPair[];
  maxBuffer: number;
  /** Extra environment, e.g. `GIT_NO_LAZY_FETCH` for local object reads. */
  env?: NodeJS.ProcessEnv;
}

export function git(args: string[], what: string, run: GitRun): Buffer {
  const env = gitEnv({ ...process.env, ...run.env }, run.config);
  const r = spawnSync('git', args, { env, input: run.input, maxBuffer: run.maxBuffer, timeout: GIT_TIMEOUT_MS, windowsHide: true });
  if (r.error) {
    const code = (r.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new InstallError('unexpected_error', 'git is not installed or not on PATH');
    if (code === 'ETIMEDOUT') throw new InstallError('network_error', `${what} timed out after ${GIT_TIMEOUT_MS / 1000}s`);
    if (code === 'ENOBUFS') throw new InstallError('incompatible', `${what} printed more than ${run.maxBuffer} bytes; point at a smaller repository or path`, { code: 'tree.limit_exceeded' });
    throw new InstallError('unexpected_error', `${what} failed: ${redactCredentials(r.error.message)}`);
  }
  if (r.signal !== null && isCleanupSignal(r.signal)) exitOnSignal(r.signal);
  if (r.status !== 0) {
    const stderr = redactCredentials(r.stderr.toString('utf8')).trim();
    const line = stderr.split('\n').filter((l) => !/^\s*$/.test(l)).pop() ?? `exit ${r.status}`;
    if (carriesCredential(run.config) && /returned error: 30[1278]/.test(stderr)) {
      const hint = "the server redirects, and redirects are not followed while the URL holds credentials; use the repository's final URL (often ending in .git)";
      throw new InstallError('usage_error', `${what} failed: ${line}`, undefined, hint);
    }
    throw new InstallError(classify(stderr), `${what} failed: ${line}`);
  }
  return r.stdout;
}

const carriesCredential = (config: readonly ConfigPair[] = []) => config.some(([key]) => key.endsWith('.extraHeader'));

function classify(stderr: string): 'auth_error' | 'not_found' | 'usage_error' | 'network_error' {
  if (/authentication failed|could not read (username|password)|terminal prompts disabled|returned error: 40[13]/i.test(stderr)) return 'auth_error';
  if (/repository .*not found|not found|remote branch .* not found|returned error: 404/i.test(stderr)) return 'not_found';
  if (/transport .* not allowed|unsupported protocol/i.test(stderr)) return 'usage_error';
  return 'network_error';
}

/** Which of `names` the remote has as a branch or tag, asked with exact ref patterns. */
export function remoteRefNames(remote: Remote, label: string, names: readonly string[], transport = 'https'): Set<string> {
  if (names.length === 0) return new Set();
  const patterns = names.flatMap((n) => [`refs/heads/${n}`, `refs/tags/${n}`]);
  const out = git([...guardArgs(transport), 'ls-remote', '--heads', '--tags', '--', remote.url, ...patterns], `looking up refs of ${label}`, {
    config: remote.config,
    maxBuffer: 16 * 1024 * 1024,
  });
  const found = new Set<string>();
  for (const line of out.toString('utf8').split('\n')) {
    const ref = line.split('\t')[1]?.replace(/\^\{\}$/, '');
    const name = ref?.replace(/^refs\/(?:heads|tags)\//, '');
    if (name !== undefined && name !== ref && names.includes(name)) found.add(name);
  }
  return found;
}
