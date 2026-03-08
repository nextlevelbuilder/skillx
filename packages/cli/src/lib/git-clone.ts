import simpleGit from 'simple-git';
import { join, normalize, resolve, sep } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

const CLONE_TIMEOUT_MS = 60000;

export class GitCloneError extends Error {
  readonly url: string;
  readonly isTimeout: boolean;
  readonly isAuthError: boolean;

  constructor(message: string, url: string, isTimeout = false, isAuthError = false) {
    super(message);
    this.name = 'GitCloneError';
    this.url = url;
    this.isTimeout = isTimeout;
    this.isAuthError = isAuthError;
  }
}

/** Shallow clone a git repository to a temp directory */
export async function cloneRepo(url: string, ref?: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'skillx-'));
  const git = simpleGit({
    timeout: { block: CLONE_TIMEOUT_MS },
    // Disable interactive credential prompts
    config: ['core.askPass=', 'credential.helper='],
  });
  const cloneOptions = ref ? ['--depth', '1', '--branch', ref] : ['--depth', '1'];

  try {
    await git.clone(url, tempDir, cloneOptions);
    return tempDir;
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    const msg = error instanceof Error ? error.message : String(error);
    const isTimeout = msg.includes('block timeout') || msg.includes('timed out');
    const isAuth =
      msg.includes('Authentication failed') ||
      msg.includes('could not read Username') ||
      msg.includes('Permission denied') ||
      msg.includes('Repository not found');

    if (isTimeout) {
      throw new GitCloneError(
        'Clone timed out after 60s. Ensure you have access and credentials configured.\n' +
          '  SSH: ssh-add -l | HTTPS: gh auth status',
        url, true, false
      );
    }
    if (isAuth) {
      throw new GitCloneError(
        `Authentication failed for ${url}.\n` +
          '  SSH: ssh -T git@github.com | HTTPS: gh auth login',
        url, false, true
      );
    }
    throw new GitCloneError(`Failed to clone ${url}: ${msg}`, url);
  }
}

/** Safe cleanup — validates path is within tmpdir before deleting */
export async function cleanupTempDir(dir: string): Promise<void> {
  const normalizedDir = normalize(resolve(dir));
  const normalizedTmp = normalize(resolve(tmpdir()));

  if (!normalizedDir.startsWith(normalizedTmp + sep) && normalizedDir !== normalizedTmp) {
    throw new Error('Attempted to clean up directory outside of temp directory');
  }
  await rm(dir, { recursive: true, force: true });
}
