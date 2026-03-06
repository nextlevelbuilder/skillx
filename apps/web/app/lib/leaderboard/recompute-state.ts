/**
 * KV-backed checkpoint state for bulk recompute operations.
 * Allows interrupted recompute runs to resume from the last successful batch.
 */

const RECOMPUTE_STATE_KEY = "recompute:progress";

export interface RecomputeState {
  offset: number;
  totalProcessed: number;
  totalSkills: number;
  batchSize: number;
  startedAt: string;
  lastBatchAt: string;
  status: "running" | "completed" | "failed";
  error?: string;
}

export interface RecomputeOptions {
  batchSize?: number;
  offset?: number;
  resume?: boolean;
}

export interface RecomputeResult {
  processed: number;
  total: number;
  nextOffset: number | null;
  state: RecomputeState;
}

/** Load saved checkpoint from KV (or null if none) */
export async function loadState(kv: KVNamespace): Promise<RecomputeState | null> {
  const raw = await kv.get(RECOMPUTE_STATE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as RecomputeState;
}

/** Persist checkpoint to KV */
export async function saveState(kv: KVNamespace, state: RecomputeState): Promise<void> {
  await kv.put(RECOMPUTE_STATE_KEY, JSON.stringify(state), {
    expirationTtl: 86400, // 24h TTL — auto-cleanup stale state
  });
}

/** Delete checkpoint from KV */
export async function clearState(kv: KVNamespace): Promise<void> {
  await kv.delete(RECOMPUTE_STATE_KEY);
}
