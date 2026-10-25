import { ApiError, apiRequest as rawRequest } from './api-client.js';

/**
 * Typed client for the personal kit API (`/api/v1/kits/@handle/name`, see
 * docs/personal-kits-api.md). Documents and overlays are passed through as
 * the canonical JSON the server validates; nothing here computes digests or
 * merges content, and no call activates a revision without an explicit
 * `approval.revisionDigest` from the user.
 */

export interface RevisionView {
  id: string;
  number: number;
  digest: string;
  state: 'draft' | 'proposed' | 'reviewed' | 'rejected' | 'quarantined';
  origin: string;
  parentRevisionId: string | null;
}

export interface StoredRevision {
  revision: RevisionView;
  generation: number;
  replayed: boolean;
  warnings: string[];
}

export interface Update {
  package: string;
  version: string;
}

/** The code a deployment with the personal kit API turned off answers on every path. */
export const KIT_API_DISABLED = 'kit.api_disabled';

/**
 * The deployment does not offer personal kits (its flag is off). It is not a
 * missing kit: nothing was deleted and local kits keep working.
 */
export class KitApiDisabledError extends ApiError {
  constructor(body: string) {
    super(404, 'this SkillX deployment does not offer personal kits yet (kit.api_disabled); nothing was changed and your local kits are unaffected', body);
    this.name = 'KitApiDisabledError';
  }
}

async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    return await rawRequest<T>(endpoint, options);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.code === KIT_API_DISABLED) throw new KitApiDisabledError(error.body);
    throw error;
  }
}

const KIT = /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9._-]{0,63}$/;

function kitPath(kit: string, sub = ''): string {
  if (!KIT.test(kit)) throw new Error(`invalid kit name: ${kit}`);
  return `/api/v1/kits/${kit}${sub === '' ? '' : `/${sub}`}`;
}

const post = <T>(kit: string, sub: string, body: unknown, headers?: Record<string, string>) =>
  apiRequest<T>(kitPath(kit, sub), { method: 'POST', body: JSON.stringify(body), ...(headers ? { headers } : {}) });

/**
 * How a write names the generation it expects: in the body (a stale one is
 * 409), or as `If-Match: "g<n>"` (a stale one is 412).
 */
export type GenerationGuard = 'body' | 'if-match';

function guarded(generation: number, guard: GenerationGuard): { body: { expectedGeneration?: number }; headers?: Record<string, string> } {
  return guard === 'if-match' ? { body: {}, headers: { 'If-Match': `"g${generation}"` } } : { body: { expectedGeneration: generation } };
}

export const kitApi = {
  get: (kit: string) => apiRequest<{ kit: string; generation: number; effectiveRevision: RevisionView | null }>(kitPath(kit)),
  revisions: (kit: string) => apiRequest<{ revisions: RevisionView[] }>(kitPath(kit, 'revisions')),
  revision: (kit: string, revisionId: string) => apiRequest<RevisionView & { document: unknown }>(kitPath(kit, `revisions/${encodeURIComponent(revisionId)}`)),
  storeRevision: (kit: string, document: unknown, expectedGeneration: number, idempotencyKey: string, guard: GenerationGuard = 'body') => {
    const { body, headers } = guarded(expectedGeneration, guard);
    return post<StoredRevision>(kit, 'revisions', { ...body, idempotencyKey, document }, headers);
  },
  previewUpdate: (kit: string, updates: Update[], fromRevisionId?: string) =>
    post<{ report: unknown; generation: number }>(kit, 'preview-update', { updates, ...(fromRevisionId ? { fromRevisionId } : {}) }),
  rebase: (kit: string, updates: Update[], expectedGeneration: number, idempotencyKey: string) =>
    post<{ status: 'clean' | 'needs-review' | 'unchanged'; report: unknown; conflictId?: string; revision?: RevisionView; generation: number }>(
      kit,
      'rebase',
      { expectedGeneration, idempotencyKey, updates },
    ),
  resolveConflict: (kit: string, conflictId: string, body: { expectedGeneration: number; idempotencyKey: string; decisions: unknown[]; agentSuggestion?: unknown }) =>
    post<StoredRevision & { conflictId: string; reevalRequired: boolean }>(kit, `conflicts/${encodeURIComponent(conflictId)}/resolve`, { ...body, approvedBy: 'user' }),
  activate: (kit: string, revision: Pick<RevisionView, 'id' | 'digest'>, expectedGeneration: number, rollback = false, guard: GenerationGuard = 'body') => {
    const { body, headers } = guarded(expectedGeneration, guard);
    return post<{ effectiveRevisionId: string; generation: number; lock: unknown; warnings: string[] }>(
      kit,
      rollback ? 'rollback' : 'activate',
      { ...body, revisionId: revision.id, approval: { revisionDigest: revision.digest } },
      headers,
    );
  },
  /** Dry-run of a `skillx.kit-proposal/v1` envelope: every server check, nothing stored. */
  validateProposal: (kit: string, proposal: unknown, expectedGeneration?: number) =>
    post<{ valid: true; state: 'proposed' | 'quarantined'; revisionDigest: string; requiredPermissions: string[]; findings: string[]; generationConflict: boolean }>(
      kit,
      'proposals/validate',
      { proposal, ...(expectedGeneration === undefined ? {} : { expectedGeneration }) },
    ),
  submitProposal: (kit: string, proposal: unknown, expectedGeneration: number, idempotencyKey: string) =>
    post<StoredRevision>(kit, 'proposals', { expectedGeneration, idempotencyKey, proposal }),
  // Review and activation of a proposal need the owner's web session; an API key cannot approve.
  lock: (kit: string, revisionId?: string) =>
    apiRequest<{ lock: unknown; documents: unknown[]; warnings: string[] }>(kitPath(kit, revisionId ? `lock?revision=${encodeURIComponent(revisionId)}` : 'lock')),
};
