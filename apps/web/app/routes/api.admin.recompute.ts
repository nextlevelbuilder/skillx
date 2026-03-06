/**
 * Admin endpoint: bulk recompute leaderboard scores with checkpoint/resume.
 * Auth: X-Admin-Secret header only (no query param to avoid log leakage).
 *
 * GET  /api/admin/recompute              — check progress
 * POST /api/admin/recompute              — run one batch (default 100)
 * POST /api/admin/recompute  batch=200   — custom batch size
 * POST /api/admin/recompute  offset=500  — start from specific offset
 * POST /api/admin/recompute  resume=true — resume from last checkpoint
 * POST /api/admin/recompute  all=true    — run all batches until done
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import {
  recomputeBatch,
  getRecomputeProgress,
} from "~/lib/leaderboard/recompute-all-skills";

/** Max batches per `all=true` request to avoid Worker CPU timeout */
const MAX_BATCHES_PER_REQUEST = 50;

function verifyAdmin(request: Request, env: Record<string, string>): boolean {
  const secret = request.headers.get("X-Admin-Secret");
  return !!secret && secret === env.ADMIN_SECRET;
}

function parseIntSafe(value: string | null, fallback: number): number {
  if (value == null) return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) || n < 0 ? fallback : n;
}

/** GET — check current recompute progress */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Record<string, string>;
  if (!verifyAdmin(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kv = (context.cloudflare.env as Record<string, unknown>).KV as KVNamespace;
  const progress = await getRecomputeProgress(kv);

  return Response.json({
    status: progress ? progress.status : "idle",
    progress,
  });
}

/** POST — run recompute batch(es) */
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Record<string, unknown>;
  if (!verifyAdmin(request, env as Record<string, string>)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const batchSize = parseIntSafe(url.searchParams.get("batch"), 100);
  const offsetParam = url.searchParams.get("offset");
  const resume = url.searchParams.get("resume") === "true";
  const runAll = url.searchParams.get("all") === "true";

  const db = getDb(env.DB as D1Database);
  const kv = env.KV as KVNamespace;

  try {
    if (runAll) {
      let totalProcessed = 0;
      let batchCount = 0;
      const startOffset = offsetParam != null ? parseIntSafe(offsetParam, 0) : null;

      let result = await recomputeBatch(db, kv, {
        batchSize,
        offset: startOffset ?? undefined,
        resume: startOffset == null ? resume : false,
      });
      totalProcessed += result.processed;
      batchCount++;

      // Loop with max-iterations guard to avoid Worker timeout
      while (result.nextOffset !== null && batchCount < MAX_BATCHES_PER_REQUEST) {
        result = await recomputeBatch(db, kv, {
          batchSize,
          offset: result.nextOffset,
        });
        totalProcessed += result.processed;
        batchCount++;
      }

      const hitLimit = batchCount >= MAX_BATCHES_PER_REQUEST && result.nextOffset !== null;

      return Response.json({
        message: hitLimit
          ? `Paused after ${MAX_BATCHES_PER_REQUEST} batches. Call again with resume=true to continue.`
          : "Recompute complete",
        totalProcessed,
        totalSkills: result.total,
        batches: batchCount,
        nextOffset: result.nextOffset,
        state: result.state,
      });
    }

    // Single batch mode
    const result = await recomputeBatch(db, kv, {
      batchSize,
      offset: offsetParam != null ? parseIntSafe(offsetParam, 0) : undefined,
      resume,
    });

    return Response.json({
      message:
        result.nextOffset === null
          ? "Recompute complete"
          : `Batch done. Next offset: ${result.nextOffset}`,
      processed: result.processed,
      total: result.total,
      nextOffset: result.nextOffset,
      state: result.state,
    });
  } catch (error) {
    console.error("Recompute error:", error);
    return Response.json(
      {
        error: "Recompute failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
