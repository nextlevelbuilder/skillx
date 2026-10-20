/**
 * Row shapes of collections and their revisions, and the JSON views the API
 * answers with. `moderation` is shown only to the owner (and operators): a
 * hidden collection is 404 to everyone else, so they never see the field set.
 */
import type { CollectionConfig, CollectionMember } from "@skillx/contracts";

export interface CollectionRow {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  visibility: string;
  latest_revision_number: number;
  cloned_from_revision_id: string | null;
  /** Absent on a database before migration 0020; read through `isHidden`. */
  moderation_state?: string;
  moderation_reason?: string | null;
  moderated_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface CollectionRevisionRow {
  id: string;
  collection_id: string;
  revision_number: number;
  members_json: string;
  config_json: string | null;
  revision_digest: string | null;
  created_at: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Hidden by an operator: 404 to everyone but the owner, whatever the visibility. */
export const isHidden = (row: CollectionRow) => row.moderation_state === "hidden";

export function collectionView(row: CollectionRow, userId: string | null) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    visibility: row.visibility,
    owned: row.owner_id === userId,
    latestRevisionNumber: row.latest_revision_number,
    clonedFromRevisionId: row.cloned_from_revision_id,
    ...(isHidden(row) ? { moderation: { state: "hidden", reason: row.moderation_reason ?? null, at: row.moderated_at == null ? null : iso(row.moderated_at) } } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function revisionView(row: CollectionRevisionRow) {
  return {
    id: row.id,
    collectionId: row.collection_id,
    revisionNumber: row.revision_number,
    revisionDigest: row.revision_digest,
    members: JSON.parse(row.members_json) as CollectionMember[],
    config: (row.config_json === null ? {} : JSON.parse(row.config_json)) as CollectionConfig,
    createdAt: iso(row.created_at),
  };
}

