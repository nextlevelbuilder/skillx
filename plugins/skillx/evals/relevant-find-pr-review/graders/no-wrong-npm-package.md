---
type: regex
target: trace
pattern: '(npx|bunx|pnpm\s+dlx|yarn\s+dlx|npm\s+exec)\s+(--yes\s+|-y\s+)?skillx(\s|@|\\")'
match: not_contains
---
