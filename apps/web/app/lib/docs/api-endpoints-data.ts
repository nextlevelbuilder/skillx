import type { EndpointProps } from "~/components/docs/api-endpoint-card";

/** Search + Skill endpoint definitions for the API reference page. */

export const SEARCH_ENDPOINTS: EndpointProps[] = [
  {
    id: "search-get",
    method: "GET",
    path: "/api/search?q=<query>",
    auth: "Optional",
    description: "Search skills via hybrid keyword + semantic engine. Authenticated users get personalized favorite boost.",
    params: [
      { name: "q", type: "string", required: true, description: "Search query" },
      { name: "category", type: "string", required: false, description: "Filter by category" },
      { name: "is_paid", type: "string", required: false, description: '"true" or "false"' },
      { name: "limit", type: "number", required: false, description: "Max results (max 100)", default: "20" },
    ],
    responseExample: `{
  "results": [
    {
      "id": "uuid",
      "name": "Skill Name",
      "slug": "skill-name",
      "description": "...",
      "category": "development",
      "avg_rating": 8.5,
      "install_count": 1200,
      "github_stars": 450,
      "final_score": 0.82,
      "rrf_score": 0.031,
      "semantic_rank": 2,
      "keyword_rank": 5
    }
  ],
  "count": 1
}`,
    notes: ['Returns empty results if no "q" param provided.'],
    errors: [
      { status: 400, body: "Query parameter is required", cause: "Missing or non-string query" },
      { status: 500, body: "Search failed", cause: "Internal error" },
    ],
  },
  {
    id: "search-post",
    method: "POST",
    path: "/api/search",
    auth: "Optional",
    description: "Same search via JSON body. Preferred for API integrations.",
    params: [
      { name: "query", type: "string", required: true, description: "Search query" },
      { name: "category", type: "string", required: false, description: "Filter by category" },
      { name: "is_paid", type: "boolean", required: false, description: "Filter free/paid" },
      { name: "limit", type: "number", required: false, description: "Max results (max 100)", default: "20" },
    ],
    requestExample: `{
  "query": "kubernetes deploy",
  "category": "devops",
  "is_paid": false,
  "limit": 20
}`,
    responseExample: `Same as GET /api/search`,
    errors: [
      { status: 400, body: "Query parameter is required", cause: "Missing or non-string query" },
      { status: 500, body: "Search failed", cause: "Internal error" },
    ],
  },
];

export const SKILL_ENDPOINTS: EndpointProps[] = [
  {
    id: "skill-detail",
    method: "GET",
    path: "/api/skills/:slug",
    auth: "Optional",
    description: "Fetch full skill details with reviews and rating summary. Authenticated users see isFavorited status.",
    responseExample: `{
  "skill": { "id": "uuid", "name": "...", "slug": "...", "content": "...", ... },
  "reviews": [{ "id": "...", "content": "...", "created_at": 1707955200000 }],
  "isFavorited": false,
  "ratingSummary": { "avgRating": 8.5, "ratingCount": 42 }
}`,
    errors: [
      { status: 400, body: "Skill slug is required", cause: "Missing slug param" },
      { status: 404, body: "Skill not found", cause: "Invalid slug" },
    ],
  },
  {
    id: "skill-rate",
    method: "POST",
    path: "/api/skills/:slug/rate",
    auth: "Session required",
    description: "Rate a skill (0-10 scale). Upserts — re-rating updates existing score.",
    params: [
      { name: "score", type: "number", required: true, description: "Rating 0-10 inclusive" },
    ],
    requestExample: `{ "score": 8.5 }`,
    responseExample: `{ "success": true, "avg_rating": 8.2, "rating_count": 43 }`,
    errors: [
      { status: 400, body: "Score must be a number between 0 and 10", cause: "Invalid score value" },
      { status: 401, body: "Authentication required", cause: "Not logged in" },
      { status: 403, body: "Cross-origin request refused", cause: "Origin is not this site" },
      { status: 404, body: "Skill not found", cause: "Invalid slug" },
    ],
  },
  {
    id: "skill-vote",
    method: "POST",
    path: "/api/skills/:slug/vote",
    auth: "Session required",
    description: "Upvote, downvote, or clear your vote. Rate limited to 10 votes per minute.",
    params: [
      { name: "type", type: "string", required: true, description: '"up", "down", or "none" (clears the vote)' },
    ],
    requestExample: `{ "type": "up" }`,
    responseExample: `{ "vote_type": "up", "net_votes": 39 }`,
    errors: [
      { status: 400, body: "type must be 'up', 'down', or 'none'", cause: "Invalid type" },
      { status: 401, body: "Authentication required", cause: "Not logged in" },
      { status: 403, body: "Cross-origin request refused", cause: "Origin is not this site" },
      { status: 404, body: "Skill not found", cause: "Invalid slug" },
      { status: 429, body: "Rate limit exceeded. Max 10 votes per minute.", cause: "Too many votes" },
    ],
  },
  {
    id: "skill-review-get",
    method: "GET",
    path: "/api/skills/:slug/review",
    auth: "None",
    description: "List reviews for a skill, newest first (max 100).",
    responseExample: `{
  "reviews": [
    {
      "id": "review-...",
      "content": "Excellent skill for Kubernetes deployment",
      "is_agent": false,
      "created_at": 1707955200000
    }
  ]
}`,
    errors: [{ status: 404, body: "Skill not found", cause: "Invalid slug" }],
  },
  {
    id: "skill-review-post",
    method: "POST",
    path: "/api/skills/:slug/review",
    auth: "Session required",
    description: "Submit a text review for a skill.",
    params: [
      { name: "content", type: "string", required: true, description: "1-2000 characters" },
    ],
    requestExample: `{ "content": "This skill saved me hours of work!" }`,
    responseExample: `{ "success": true, "review": { "id": "review-...", "content": "...", ... } }`,
    errors: [
      { status: 400, body: "Review content cannot be empty", cause: "Empty content" },
      { status: 400, body: "Cannot exceed 2000 characters", cause: "Too long" },
      { status: 401, body: "Authentication required", cause: "Not logged in" },
      { status: 403, body: "Cross-origin request refused", cause: "Origin is not this site" },
      { status: 404, body: "Skill not found", cause: "Invalid slug" },
    ],
  },
  {
    id: "skill-favorite",
    method: "POST",
    path: "/api/skills/:slug/favorite",
    auth: "Session required",
    description: "Toggle favorite status. Adds if not favorited, removes if already favorited.",
    responseExample: `{ "favorited": true }`,
    notes: ["favorited: true = added, false = removed. No request body needed."],
    errors: [
      { status: 401, body: "Authentication required", cause: "Not logged in" },
      { status: 403, body: "Cross-origin request refused", cause: "Origin is not this site" },
      { status: 404, body: "Skill not found", cause: "Invalid slug" },
    ],
  },
];
