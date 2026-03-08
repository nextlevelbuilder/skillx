import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';

const LOCK_FILE = '.skills.lock.json';

interface LockEntry {
  source: string;
  sourceType: string;
  sourceUrl?: string;
  skillPath?: string;
  skillFolderHash?: string;
  pluginName?: string;
  installedAt: string;
}

interface LockFile {
  version: number;
  skills: Record<string, LockEntry>;
  preferences?: {
    lastSelectedAgents?: string[];
    dismissedPrompts?: string[];
  };
}

function getLockFilePath(): string {
  return join(homedir(), '.agents', LOCK_FILE);
}

async function readLockFile(): Promise<LockFile> {
  try {
    const content = await readFile(getLockFilePath(), 'utf-8');
    return JSON.parse(content) as LockFile;
  } catch {
    return { version: 1, skills: {} };
  }
}

async function writeLockFile(data: LockFile): Promise<void> {
  const path = getLockFilePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

/** Add or update a skill entry in the lock file */
export async function addSkillToLock(
  skillName: string,
  entry: Omit<LockEntry, 'installedAt'>
): Promise<void> {
  const lock = await readLockFile();
  lock.skills[skillName] = { ...entry, installedAt: new Date().toISOString() };
  await writeLockFile(lock);
}

/** Get the list of last selected agents */
export async function getLastSelectedAgents(): Promise<string[] | undefined> {
  const lock = await readLockFile();
  return lock.preferences?.lastSelectedAgents;
}

/** Save the list of selected agents for next time */
export async function saveSelectedAgents(agents: string[]): Promise<void> {
  const lock = await readLockFile();
  if (!lock.preferences) lock.preferences = {};
  lock.preferences.lastSelectedAgents = agents;
  await writeLockFile(lock);
}

/** Check if a prompt has been dismissed */
export async function isPromptDismissed(key: string): Promise<boolean> {
  const lock = await readLockFile();
  return lock.preferences?.dismissedPrompts?.includes(key) ?? false;
}

/** Dismiss a prompt so it won't show again */
export async function dismissPrompt(key: string): Promise<void> {
  const lock = await readLockFile();
  if (!lock.preferences) lock.preferences = {};
  if (!lock.preferences.dismissedPrompts) lock.preferences.dismissedPrompts = [];
  if (!lock.preferences.dismissedPrompts.includes(key)) {
    lock.preferences.dismissedPrompts.push(key);
  }
  await writeLockFile(lock);
}
