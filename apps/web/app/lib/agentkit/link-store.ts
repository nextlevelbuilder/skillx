/** D1 access for `agentkit_links` (see db/agentkit-link-schema.ts). */

export interface AgentKitLink {
  userId: string;
  issuer: string;
  sub: string;
  scopes: string;
  refreshTokenEnc: string | null;
  linkedAt: number;
  validatedAt: number;
  /** Paid kits the account owned at the last link or refresh (sorted). */
  kits: string[];
}

interface LinkRow {
  user_id: string;
  issuer: string;
  agentkit_sub: string;
  scopes: string;
  refresh_token_enc: string | null;
  linked_at: number;
  validated_at: number;
  kits: string;
}

const COLUMNS = "user_id, issuer, agentkit_sub, scopes, refresh_token_enc, linked_at, validated_at, kits";

/** Stored as the sorted JSON array `kitEntitled` reads (lib/releases/kit-entitlement-sql.ts). */
const storedKits = (kits: readonly string[]) => JSON.stringify([...new Set(kits)].sort());

function parseStoredKits(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((kit): kit is string => typeof kit === "string") : [];
  } catch {
    return [];
  }
}

const toLink = (row: LinkRow | null): AgentKitLink | null =>
  row === null
    ? null
    : {
        userId: row.user_id,
        issuer: row.issuer,
        sub: row.agentkit_sub,
        scopes: row.scopes,
        refreshTokenEnc: row.refresh_token_enc,
        linkedAt: row.linked_at,
        validatedAt: row.validated_at,
        kits: parseStoredKits(row.kits),
      };

export async function linkOfUser(db: D1Database, userId: string): Promise<AgentKitLink | null> {
  return toLink(await db.prepare(`SELECT ${COLUMNS} FROM agentkit_links WHERE user_id = ?`).bind(userId).first<LinkRow>());
}

export async function linkOfSubject(db: D1Database, issuer: string, sub: string): Promise<AgentKitLink | null> {
  return toLink(await db.prepare(`SELECT ${COLUMNS} FROM agentkit_links WHERE issuer = ? AND agentkit_sub = ?`).bind(issuer, sub).first<LinkRow>());
}

/** Inserts a link; false when either side is already linked (the unique keys decide, so races are safe). */
export async function insertLink(db: D1Database, link: AgentKitLink): Promise<boolean> {
  const result = await db
    .prepare(`INSERT INTO agentkit_links (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
    .bind(link.userId, link.issuer, link.sub, link.scopes, link.refreshTokenEnc, link.linkedAt, link.validatedAt, storedKits(link.kits))
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function deleteLink(db: D1Database, userId: string): Promise<void> {
  await db.prepare("DELETE FROM agentkit_links WHERE user_id = ?").bind(userId).run();
}

/**
 * Claims the one refresh of this link until `until`. False when another
 * request holds it, or already refreshed since `validatedAt` was read: the
 * refresh token that read saw may be spent.
 */
export async function claimRefresh(db: D1Database, userId: string, validatedAt: number, now: number, until: number): Promise<boolean> {
  const result = await db
    .prepare("UPDATE agentkit_links SET refreshing_until = ? WHERE user_id = ? AND validated_at = ? AND (refreshing_until IS NULL OR refreshing_until < ?)")
    .bind(until, userId, validatedAt, now)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

/** Stores a rotated refresh token as soon as the AS issues it, keeping the claim. */
export async function storeRefreshToken(db: D1Database, userId: string, refreshTokenEnc: string): Promise<void> {
  await db.prepare("UPDATE agentkit_links SET refresh_token_enc = ? WHERE user_id = ?").bind(refreshTokenEnc, userId).run();
}

/** Records a verified refresh; `kits` replaces the stored kits (the claim is the whole current set). */
export async function recordRefresh(db: D1Database, userId: string, refreshTokenEnc: string | null, scopes: string | null, kits: readonly string[], now: number): Promise<void> {
  await db
    .prepare("UPDATE agentkit_links SET refresh_token_enc = COALESCE(?, refresh_token_enc), scopes = COALESCE(?, scopes), kits = ?, validated_at = ?, refreshing_until = NULL WHERE user_id = ?")
    .bind(refreshTokenEnc, scopes, storedKits(kits), now, userId)
    .run();
}

export async function releaseRefresh(db: D1Database, userId: string, until: number | null = null): Promise<void> {
  await db.prepare("UPDATE agentkit_links SET refreshing_until = ? WHERE user_id = ?").bind(until, userId).run();
}
