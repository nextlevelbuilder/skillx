#!/bin/bash
# Bulk recompute leaderboard scores via admin API.
# Supports resume — just re-run if interrupted.
# Usage: ADMIN_SECRET=xxx ./scripts/run-recompute.sh [batch_size]

set -euo pipefail

API_URL="${API_URL:-https://skillx.sh/api/admin/recompute}"
BATCH_SIZE="${1:-10}"
SECRET="${ADMIN_SECRET:?ADMIN_SECRET env var required}"
DELAY="${DELAY:-1}" # seconds between batches

echo "Starting recompute (batch=$BATCH_SIZE, resume=true)"
echo "API: $API_URL"
echo ""

TOTAL_PROCESSED=0
BATCH_NUM=0
NEXT_OFFSET=""

# First call with resume=true to pick up from checkpoint
RESUME_FLAG="resume=true"

while true; do
  BATCH_NUM=$((BATCH_NUM + 1))

  if [ -n "$NEXT_OFFSET" ]; then
    URL="${API_URL}?batch=${BATCH_SIZE}&offset=${NEXT_OFFSET}"
  else
    URL="${API_URL}?batch=${BATCH_SIZE}&${RESUME_FLAG}"
  fi

  RESPONSE=$(curl -s -X POST -H "X-Admin-Secret: ${SECRET}" "$URL")

  # Check for error
  ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null || echo "parse_error")

  if [ -n "$ERROR" ] && [ "$ERROR" != "" ]; then
    echo "ERROR at batch $BATCH_NUM: $ERROR"
    echo "Details: $(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('details',''))" 2>/dev/null)"
    echo "State saved in KV. Re-run this script to resume."
    exit 1
  fi

  PROCESSED=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['processed'])" 2>/dev/null)
  TOTAL=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])" 2>/dev/null)
  NEXT_OFFSET=$(echo "$RESPONSE" | python3 -c "import sys,json; v=json.load(sys.stdin)['nextOffset']; print(v if v else '')" 2>/dev/null)
  TOTAL_PROCESSED=$((TOTAL_PROCESSED + PROCESSED))

  printf "Batch %d: processed %d | total %d/%d\n" "$BATCH_NUM" "$PROCESSED" "$TOTAL_PROCESSED" "$TOTAL"

  # Check if done
  if [ -z "$NEXT_OFFSET" ] || [ "$NEXT_OFFSET" = "None" ] || [ "$NEXT_OFFSET" = "null" ]; then
    echo ""
    echo "Recompute complete! Total processed: $TOTAL_PROCESSED / $TOTAL"
    break
  fi

  sleep "$DELAY"
done
