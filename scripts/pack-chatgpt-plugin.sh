#!/usr/bin/env bash
# Builds the ZIP uploaded to the OpenAI plugin portal from integrations/chatgpt/plugin.
# The archive holds the plugin root's contents (plugin.json at the top level), nothing
# else, with fixed timestamps so the same tree always yields the same bytes.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
plugin_root="$repo_root/integrations/chatgpt/plugin"
version="$(node -p "require('$plugin_root/plugin.json').version")"
out="${1:-$repo_root/dist/skillx-chatgpt-plugin-$version.zip}"

mkdir -p "$(dirname "$out")"
rm -f "$out"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

cp -R "$plugin_root/." "$stage/"
find "$stage" -exec touch -h -t 202601010000 {} +
(cd "$stage" && find . -type f ! -name '.DS_Store' | LC_ALL=C sort | sed 's|^\./||' | zip -X -q "$out" -@)

echo "$out"
unzip -l "$out" | tail -n +4 | head -n -2 | awk '{print "  " $4}'
