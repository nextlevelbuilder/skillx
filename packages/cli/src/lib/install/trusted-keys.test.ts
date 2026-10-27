import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyReleaseManifest } from '@skillx/contracts';
import { loadTrustedKeys } from './trusted-keys.js';

// A production release manifest exactly as https://skillx.sh served it,
// signed by the registry key the CLI embeds.
const PRODUCTION_MANIFEST = readFileSync(new URL('./fixtures/bestagentkits-plan-0.1.0.manifest.json', import.meta.url));
const PRODUCTION_KEY_ID = 'skillx-reg-993cd14a011f7b76';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'skillx-keys-'));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function issueCodes(result: Awaited<ReturnType<typeof verifyReleaseManifest>>): string[] {
  return result.valid ? [] : result.issues.map((i) => i.code);
}

describe('embedded registry key', () => {
  it('derives its key id from the key bytes', () => {
    const raw = loadTrustedKeys(home, {}).get(PRODUCTION_KEY_ID);
    expect(raw).toBeDefined();
    expect(`skillx-reg-${createHash('sha256').update(raw!).digest('hex').slice(0, 16)}`).toBe(PRODUCTION_KEY_ID);
  });

  it('verifies a production manifest with no trust configuration', async () => {
    expect((await verifyReleaseManifest(PRODUCTION_MANIFEST, loadTrustedKeys(home, {}))).valid).toBe(true);
  });

  it('still refuses a manifest signed by a key it does not know', async () => {
    const manifest = JSON.parse(PRODUCTION_MANIFEST.toString('utf8')) as Record<string, unknown>;
    manifest.keyId = 'skillx-reg-0000000000000000';
    const result = await verifyReleaseManifest(JSON.stringify(manifest), loadTrustedKeys(home, {}));
    expect(issueCodes(result)).toEqual(['signature.unknown_key']);
  });

  it('lets the trusted keys file and SKILLX_TRUSTED_KEYS override the embedded key', async () => {
    const other = Buffer.alloc(32, 9).toString('base64');
    writeFileSync(join(home, 'trusted-keys.json'), JSON.stringify({ keys: { [PRODUCTION_KEY_ID]: other } }));
    const fromFile = await verifyReleaseManifest(PRODUCTION_MANIFEST, loadTrustedKeys(home, {}));
    expect(issueCodes(fromFile)).toEqual(['signature.mismatch']);
    const fromEnv = await verifyReleaseManifest(PRODUCTION_MANIFEST, loadTrustedKeys(join(home, 'none'), { SKILLX_TRUSTED_KEYS: `${PRODUCTION_KEY_ID}=${other}` }));
    expect(issueCodes(fromEnv)).toEqual(['signature.mismatch']);
  });
});
