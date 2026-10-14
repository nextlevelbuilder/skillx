import { apiRequest } from './api-client.js';

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

const KIT = /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9._-]{0,63}$/;

function kitPath(kit: string, sub = ''): string {
  if (!KIT.test(kit)) throw new Error(`invalid kit name: ${kit}`);
  return `/api/v1/kits/${kit}${sub === '' ? '' : `/${sub}`}`;
}

const post = <T>(kit: string, sub: string, body: unknown) =>
  apiRequest<T>(kitPath(kit, sub), { method: 'POST', body: JSON.stringify(body) });

export const kitApi = {
  get: (kit: string) => apiRequest<{ kit: string; generation: number; effectiveRevision: RevisionView | null }>(kitPath(kit)),
  storeRevision: (kit: string, document: unknown, expectedGeneration: number, idempotencyKey: string) =>
    post<StoredRevision>(kit, 'revisions', { expectedGeneration, idempotencyKey, document }),
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
  activate: (kit: string, revision: Pick<RevisionView, 'id' | 'digest'>, expectedGeneration: number, rollback = false) =>
    post<{ effectiveRevisionId: string; generation: number; lock: unknown; warnings: string[] }>(kit, rollback ? 'rollback' : 'activate', {
      expectedGeneration,
      revisionId: revision.id,
      approval: { revisionDigest: revision.digest },
    }),
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
