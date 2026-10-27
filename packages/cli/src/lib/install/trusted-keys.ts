import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from './adapters.js';
import { usageError } from './install-errors.js';

/**
 * Release signing keys the installer trusts. A manifest signed by any other
 * key id fails verification, so with no trusted key nothing installs (fail
 * closed). Sources, merged in this order:
 *
 * 1. `EMBEDDED_KEYS`: keys shipped with the CLI, the production registry
 *    key published by the SkillX owner in nextlevelbuilder/skillx#31.
 * 2. `<skillxHome>/trusted-keys.json`: `{"keys": {"<keyId>": "<base64 raw Ed25519 key>"}}`.
 * 3. `SKILLX_TRUSTED_KEYS`: `<keyId>=<base64>[,<keyId>=<base64>...]`.
 *
 * Public keys are not secrets; they are still never printed in full.
 */

// The key id is the first 8 bytes of SHA-256 over the raw key, in hex.
// AgentKit embeds the same key (`skillxsource/keys.go`).
const EMBEDDED_KEYS: Record<string, string> = {
  'skillx-reg-993cd14a011f7b76': 'D76gfU7S7+yl9ubULT4FQP8ocJgXES46rzY/gp9hG+A=',
};

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function decodeKey(keyId: string, encoded: string, source: string): Uint8Array {
  if (!KEY_ID.test(keyId)) throw usageError(`invalid trusted key id in ${source}`);
  const bytes = new Uint8Array(Buffer.from(encoded.trim(), 'base64'));
  if (bytes.length !== 32) throw usageError(`trusted key ${keyId} in ${source} is not a 32-byte Ed25519 public key`);
  return bytes;
}

function fromFile(path: string): Array<[string, Uint8Array]> {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw usageError(`${path} is not JSON`);
  }
  const keys = (parsed as { keys?: unknown }).keys;
  if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) throw usageError(`${path} must be {"keys": {"<keyId>": "<base64>"}}`);
  return Object.entries(keys).map(([id, value]) => {
    if (typeof value !== 'string') throw usageError(`trusted key ${id} in ${path} must be a base64 string`);
    return [id, decodeKey(id, value, path)];
  });
}

function fromEnv(value: string | undefined): Array<[string, Uint8Array]> {
  if (!value) return [];
  return value
    .split(',')
    .filter((part) => part.trim() !== '')
    .map((part) => {
      const at = part.indexOf('=');
      if (at <= 0) throw usageError('SKILLX_TRUSTED_KEYS must be <keyId>=<base64>[,...]');
      const id = part.slice(0, at).trim();
      return [id, decodeKey(id, part.slice(at + 1), 'SKILLX_TRUSTED_KEYS')];
    });
}

export function loadTrustedKeys(home: string, env: Env = process.env): Map<string, Uint8Array> {
  const keys = new Map<string, Uint8Array>();
  for (const [id, value] of Object.entries(EMBEDDED_KEYS)) keys.set(id, decodeKey(id, value, 'the CLI'));
  for (const [id, value] of fromFile(join(home, 'trusted-keys.json'))) keys.set(id, value);
  for (const [id, value] of fromEnv(env.SKILLX_TRUSTED_KEYS)) keys.set(id, value);
  return keys;
}
