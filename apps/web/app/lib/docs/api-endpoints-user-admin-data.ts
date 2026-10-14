import type { EndpointProps } from "~/components/docs/api-endpoint-card";

/** User, API Key, Leaderboard, and Admin endpoint definitions. */

export const USER_ENDPOINTS: EndpointProps[] = [
  {
    id: "usage-report",
    method: "POST",
    path: "/api/report",
    auth: "API Key required",
    description: "Report skill execution outcome. Used by CLI to track success rates.",
    params: [
      { name: "skill_slug", type: "string", required: true, description: "Must match existing skill" },
      { name: "outcome", type: "string", required: true, description: '"success", "failure", or "partial"' },
      { name: "model", type: "string", required: false, description: "AI model used" },
      { name: "duration_ms", type: "number", required: false, description: "Execution time in ms" },
    ],
    requestExample: `{
  "skill_slug": "kubernetes-deploy",
  "outcome": "success",
  "model": "claude-sonnet-4-5-20250929",
  "duration_ms": 12500
}`,
    responseExample: `{ "success": true }`,
    errors: [
      { status: 400, body: "skill_slug is required", cause: "Missing slug" },
      { status: 400, body: "outcome must be success/failure/partial", cause: "Invalid outcome" },
      { status: 401, body: "API key required", cause: "Missing/invalid API key" },
      { status: 404, body: "Skill not found", cause: "Invalid slug" },
    ],
  },
  {
    id: "api-keys-list",
    method: "GET",
    path: "/api/user/api-keys",
    auth: "Session required",
    description: "List current user's active (non-revoked) API keys with masked values.",
    responseExample: `{
  "keys": [
    {
      "id": "key-...",
      "name": "My CLI Key",
      "key_masked": "sx_a1b2c...",
      "last_used_at": 1707955200000,
      "created_at": 1707868800000,
      "scopes": null
    }
  ]
}`,
    notes: ["scopes is null for an account key, or the scopes a release publishing key holds (e.g. releases:publish:@acme)."],
    errors: [
      { status: 401, body: "Authentication required", cause: "Not logged in" },
    ],
  },
  {
    id: "api-keys-create",
    method: "POST",
    path: "/api/user/api-keys",
    auth: "Session required",
    description: "Generate a new API key. Plaintext returned once — not stored.",
    params: [
      { name: "name", type: "string", required: false, description: "Key label (max 100 chars)", default: '"Default"' },
      { name: "scopes", type: "string[]", required: false, description: "1-8 releases:publish:@<handle> scopes for active publishers you own. Omit for an account key." },
    ],
    requestExample: `{ "name": "CI publishing", "scopes": ["releases:publish:@acme"] }`,
    responseExample: `{
  "success": true,
  "key": "sx_a1b2c3d4e5f6...",
  "scopes": ["releases:publish:@acme"],
  "message": "Save this key securely. It will not be shown again."
}`,
    notes: [
      "The plaintext key is only returned in this response. Store it securely.",
      "Without scopes the key is an account key: it works on the CLI endpoints but can never publish releases.",
      "A scoped key can only publish releases for the named publishers and is rejected by every other endpoint.",
    ],
    errors: [
      { status: 400, body: "unsupported scope ...", cause: "Unknown or malformed scope, empty list, or more than 8 scopes" },
      { status: 401, body: "Authentication required", cause: "Not logged in" },
      { status: 403, body: "You do not own an active publisher @<handle>", cause: "Scope names a publisher you do not own or that is not active" },
    ],
  },
  {
    id: "api-keys-revoke",
    method: "DELETE",
    path: "/api/user/api-keys",
    auth: "Session required",
    description: "Revoke an API key (soft delete).",
    params: [
      { name: "id", type: "string", required: true, description: "Key ID to revoke" },
    ],
    requestExample: `{ "id": "key-..." }`,
    responseExample: `{ "success": true }`,
    errors: [
      { status: 400, body: "Key ID is required", cause: "Missing ID" },
      { status: 401, body: "Authentication required", cause: "Not logged in" },
      { status: 404, body: "API key not found or already revoked", cause: "Invalid/revoked key" },
    ],
  },
];

export const OTHER_ENDPOINTS: EndpointProps[] = [
  {
    id: "leaderboard",
    method: "GET",
    path: "/api/leaderboard",
    auth: "None",
    description: "Paginated skill leaderboard with composite scoring and signal badges. Cached in KV (5min TTL).",
    params: [
      { name: "sort", type: "string", required: false, description: '"best", "rating", "installs", "trending", or "newest"', default: '"best"' },
      { name: "offset", type: "number", required: false, description: "Pagination offset", default: "0" },
      { name: "limit", type: "number", required: false, description: "Results per page (max 50)", default: "20" },
    ],
    responseExample: `{
  "entries": [
    {
      "rank": 1,
      "slug": "skill-name",
      "name": "Skill Name",
      "author": "author",
      "installs": 1200,
      "rating": 8.5,
      "badges": ["top-rated", "popular"]
    }
  ],
  "hasMore": true
}`,
    notes: [
      "hasMore: true indicates more pages at offset + limit.",
      'Badges: "top-rated", "popular", "trending", "well-maintained", "community-pick" (based on p90 thresholds).',
    ],
  },
  {
    id: "admin-seed",
    method: "POST",
    path: "/api/admin/seed",
    auth: "Admin (X-Admin-Secret header)",
    description: "Bulk upsert skills and index into Vectorize. For seeding data.",
    requestExample: `[
  {
    "name": "Kubernetes Deploy",
    "slug": "kubernetes-deploy",
    "description": "Deploy to K8s clusters",
    "content": "Full skill content...",
    "author": "skillx",
    "category": "devops"
  }
]`,
    responseExample: `{ "skills": 30, "vectors": 120, "scoresRecomputed": 30 }`,
    notes: [
      "Request body must be an array of skill objects.",
      "Required fields: name, slug, description, content, author, category.",
    ],
    errors: [
      { status: 400, body: "Request body must be an array of skills", cause: "Non-array body" },
      { status: 401, body: "Unauthorized", cause: "Missing/wrong admin secret" },
    ],
  },
];
