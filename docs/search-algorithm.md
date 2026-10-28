# Search Algorithm

Hybrid search engine combining keyword (FTS5/BM25) and semantic (vector/cosine) retrieval with Reciprocal Rank Fusion and 7-signal quality boost scoring.

## Architecture Overview

```
Query
  │
  ├── Alias expansion (k8s→kubernetes, etc.)
  │
  ├── Prefix wildcards (term → term*)
  │
  ├──► FTS5 Search (weighted BM25 + pre-filters)
  │         │
  │         ▼
  │    Ranked results (by BM25 score)
  │         │
  └──► Vector Search (semantic + metadata filters)  ◄── Workers AI embeddings
            │                                            (bge-base-en-v1.5, 768-dim)
            ▼
       Ranked results (by cosine similarity)
            │
            ▼
  ┌─────────────────────┐
  │  RRF Fusion (k=60)  │  ◄── Combines both ranked lists
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │  7-Signal Boost      │  ◄── Rating, stars, usage, success, recency, favorites
  └─────────┬───────────┘
            ▼
       Final Results
```

## Pipeline Stages

### Stage 0: Query Preprocessing

Before retrieval, the query goes through two transformations:

1. **Alias expansion**: Common abbreviations expanded via OR-join. Example: `k8s deploy` → `(kubernetes OR k8s) deploy`. Map of ~30 entries in `query-aliases.ts`.
2. **Prefix wildcards**: Each term gets a `*` suffix for partial matching. Example: `deploy` → `deploy*` (matches deploy, deployment, deployer). FTS5 operators (OR, AND, NOT) and parentheses preserved.

**Source**: `apps/web/app/lib/search/query-aliases.ts`, `apps/web/app/lib/search/fts5-search.ts`

### Stage 1: Parallel Retrieval with Pre-Filtering

FTS5 and vector search run concurrently via `Promise.all()`. Filters (category, is_paid) are pushed to retrieval stage for efficiency.

#### 1a. FTS5 Keyword Search

- **Engine**: SQLite FTS5 virtual table (`skills_fts`)
- **Ranking**: Weighted BM25 — `bm25(skills_fts, 10.0, 5.0, 1.0)` (name 10x, description 5x, content 1x)
- **Indexed fields**: Skill name, description, content (via `skills_fts` virtual table joined to `skills` on rowid)
- **Pre-filters**: Optional `category` and `is_paid` in SQL WHERE clause (parameterized)
- **Query sanitization**: Strips non-alphanumeric/whitespace chars to prevent FTS5 injection
- **Output**: List of `{ skill_id, bm25_score, rank }` ordered by weighted BM25 relevance

**Source**: `apps/web/app/lib/search/fts5-search.ts`

#### 1b. Vector Semantic Search

- **Model**: `@cf/baai/bge-base-en-v1.5` (768-dimensional embeddings)
- **Index**: Cloudflare Vectorize with cosine similarity
- **Chunking**: 512 tokens per chunk (~2048 chars), 10% overlap between chunks
- **Deduplication**: Multiple chunks per skill deduplicated by taking highest similarity score
- **Pre-filters**: Optional `category` and `is_paid` via Vectorize metadata filter
- **Over-fetching**: Queries `topK = limit * 3` to ensure enough unique skills after dedup
- **Output**: List of `{ skill_id, similarity_score, rank }` ordered by cosine similarity

**Source**: `apps/web/app/lib/search/vector-search.ts`

### Stage 2: Reciprocal Rank Fusion (RRF)

Merges the two ranked lists into a single ordering.

**Formula**:

```
RRF_score(skill) = Σ 1/(k + rank_i)
```

Where `rank_i` is the skill's position in each list it appears in.

**Parameters**:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `k` | 60 | Standard RRF smoothing constant |

**Behavior**:
- Skills appearing in both lists get contributions from both ranks
- Skills appearing in only one list get a single contribution
- Higher ranks (lower numbers) contribute more to the score
- Result: unified list sorted by `rrf_score` descending

**Example** (skill at rank 1 in semantic, rank 3 in keyword):

```
RRF = 1/(60+1) + 1/(60+3) = 0.01639 + 0.01587 = 0.03226
```

**Source**: `apps/web/app/lib/search/rrf-fusion.ts`

### Stage 3: 7-Signal Quality Boost Scoring

Adjusts RRF scores with quality signals. All components normalized to 0-1 range before weighting.

**Formula**:

```
final_score = (normalized_rrf × 0.50)
            + (normalized_rating × 0.15)
            + (normalized_stars × 0.10)
            + (normalized_usage × 0.08)
            + (success_rate × 0.07)
            + (recency_decay × 0.05)
            + (favorite_boost × 0.05)
```

#### Weight Breakdown

| Component | Weight | Range | Normalization |
|-----------|--------|-------|---------------|
| **RRF Score** | **50%** | 0-1 | `rrf_score / max_rrf_score` across result set |
| **Rating** | **15%** | 0-1 | `avg_rating / 10` (fixed 0-10 scale) |
| **GitHub Stars** | **10%** | 0-1 | `log(1 + stars) / log(1 + max_stars)` (log-scale) |
| **Usage** | **8%** | 0-1 | `log(1 + installs) / log(1 + max_installs)` (log-scale) |
| **Success Rate** | **7%** | 0-1 | `success_count / total_count` from usage_stats (default 0.5 if no data) |
| **Recency** | **5%** | 0-1 | `exp(-0.005 × days_since_update)` (~140-day half-life) |
| **Favorite** | **5%** | 0 or 1 | `1.0` if user favorited the skill, `0` otherwise |

**Notes**:
- Log-scale normalization prevents viral skills from crushing all others' usage/stars signals
- Success rate defaults to 0.5 (neutral) when no usage_stats data exists
- Recency uses exponential decay: skills updated today get ~1.0, 140 days ago ~0.5, 1 year ago ~0.16
- Favorite boost is personalized — only applies when user is authenticated
- Stats fetched in parallel (3 concurrent queries) for top `limit * 2` RRF results

**Source**: `apps/web/app/lib/search/boost-scoring.ts`

## Indexing Pipeline

When a skill is indexed into Vectorize:

1. **Text assembly**: Concatenate `name + description + content`
2. **Chunking**: Split into 512-token chunks with 10% overlap (~204 char overlap)
3. **Embedding**: Generate 768-dim vectors via `@cf/baai/bge-base-en-v1.5`
4. **Metadata**: Each vector stores `{ skill_id, category, is_paid, avg_rating, chunk_index }`
5. **Upsert**: Batch upsert to Vectorize (max 1000 vectors per batch)
6. **Vector IDs**: Format `skill_{id}_chunk_{index}`

**Source**: `apps/web/app/lib/vectorize/index-skill.ts`

## Fallback Strategy

Two levels of graceful degradation:

1. **Vectorize unavailable** (e.g., local dev): Hybrid search catches the error and falls back to FTS5-only with simplified scoring: `score = 1/(60 + rank)`. Pre-filters still applied.
2. **Both searches fail**: Returns empty results with error logged

Local development always uses FTS5-only since Vectorize bindings require `--remote` flag or deployment.

## API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/api/search?q=<query>` | Optional | Web UI search (query params) |
| `POST` | `/api/search` | Optional | API search (JSON body) |

**Request body** (POST):

```json
{
  "query": "string (required)",
  "category": "string (optional)",
  "is_paid": "boolean (optional)",
  "limit": "number (optional, max 100, default 20)"
}
```

**Auth**: Session cookie or `Authorization: Bearer <api-key>` (SHA-256 hashed lookup). Anonymous access allowed — authenticated users get personalized favorite boost.

## Response Shape

```json
{
  "results": [
    {
      "id": "string",
      "name": "string",
      "slug": "string",
      "description": "string",
      "category": "string",
      "avg_rating": 8.5,
      "install_count": 1200,
      "final_score": 0.82,
      "rrf_score": 0.031,
      "semantic_rank": 2,
      "keyword_rank": 5
    }
  ],
  "count": 1
}
```

## Source Files

| File | Purpose |
|------|---------|
| `apps/web/app/lib/search/hybrid-search.ts` | Orchestrator — parallel retrieval, fusion, 7-signal boost |
| `apps/web/app/lib/search/fts5-search.ts` | FTS5 keyword search with weighted BM25, pre-filters, prefix matching |
| `apps/web/app/lib/search/vector-search.ts` | Semantic search via Vectorize with metadata filters |
| `apps/web/app/lib/search/rrf-fusion.ts` | Reciprocal Rank Fusion algorithm |
| `apps/web/app/lib/search/boost-scoring.ts` | 7-signal quality boost scoring with log normalization |
| `apps/web/app/lib/search/query-aliases.ts` | Query alias expansion for common abbreviations |
| `apps/web/app/lib/vectorize/embed-text.ts` | Workers AI embedding generation |
| `apps/web/app/lib/vectorize/chunk-text.ts` | Text chunking with overlap |
| `apps/web/app/lib/vectorize/index-skill.ts` | Skill indexing into Vectorize |
| `apps/web/app/lib/cache/kv-cache.ts` | KV read-through cache (`getCached`) for home stats, leaderboard and llms.txt bodies; search results are not cached |
| `apps/web/app/routes/api.search.ts` | Search API route handler |
