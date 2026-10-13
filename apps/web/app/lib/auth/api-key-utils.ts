/** Lowercase hex SHA-256 of an API key, the only form ever stored for an unscoped key. */
export async function hashApiKey(plaintext: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plaintext));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Stored hash of a scoped key (e.g. `releases:publish:@handle`). It is domain
 * separated from `hashApiKey`, so a scoped key never verifies on a path that
 * checks unscoped keys: not on the current legacy routes, not on code that
 * predates scopes (a rollback), and not before the `scopes` column exists.
 */
export async function hashScopedApiKey(plaintext: string): Promise<string> {
  return hashApiKey(`skillx-scoped-api-key/v1:${plaintext}`);
}

/**
 * Generate a new API key with prefix, plaintext, and hash
 * Format: sx_ + 64 hex chars. A scoped key stores `hashScopedApiKey`.
 */
export async function generateApiKey(options: { scoped?: boolean } = {}): Promise<{
  plaintext: string;
  hash: string;
  prefix: string;
}> {
  // Generate 32 random bytes
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);

  // Convert to hex string
  const keyPart = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Create full key with prefix
  const plaintext = `sx_${keyPart}`;
  const prefix = plaintext.substring(0, 8); // "sx_xxxxx"

  // Hash the key for storage using SHA-256
  const hash = options.scoped ? await hashScopedApiKey(plaintext) : await hashApiKey(plaintext);

  return { plaintext, hash, prefix };
}

/**
 * Verify an unscoped API key against a stored hash
 */
export async function verifyApiKey(plaintext: string, storedHash: string): Promise<boolean> {
  return (await hashApiKey(plaintext)) === storedHash;
}
