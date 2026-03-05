# Phase 1: Scrape skills.sh & Fetch SKILL.md Content

**Priority:** High
**Status:** Pending

## Overview

Extract skill metadata from skills.sh leaderboard, then fetch full SKILL.md content from GitHub for each skill.

## Key Insights

- skills.sh embeds leaderboard data in SSR HTML (`__next_f` streaming format)
- Data is serialized React props — extractable via regex on JSON-like structures
- SKILL.md files live at: `https://raw.githubusercontent.com/{owner}/{repo}/main/skills/{slug}/SKILL.md`
- GitHub rate limit: 60 req/hr (unauth), 5000 req/hr (with token)

## Architecture

```
skills.sh HTML → parse leaderboard → skill list [{name, slug, owner, repo, installs}]
                                          ↓
GitHub raw content → fetch SKILL.md → full content per skill
                                          ↓
Transform → SkillX schema [{name, slug, description, content, author, ...}]
                                          ↓
Write → scripts/scraped-skills.json (intermediate output)
```

## Implementation Steps

1. **Fetch skills.sh homepage** — `fetch('https://skills.sh/')` and get HTML
2. **Parse leaderboard data** — Extract skill objects from `__next_f` payloads or visible DOM structure
   - Look for JSON patterns: `{"source":"owner/repo","skillId":"slug","name":"...",...}`
   - Fallback: parse table rows if JSON extraction fails
3. **For each skill, fetch SKILL.md** from GitHub raw content
   - URL: `https://raw.githubusercontent.com/{owner}/{repo}/main/skills/{slug}/SKILL.md`
   - Handle 404s gracefully (some skills may not have SKILL.md)
   - Parse YAML frontmatter for metadata
   - Use markdown body as `content`
4. **Transform to SkillX schema**:
   ```
   skills.sh             → SkillX
   ─────────────────────────────────
   name/skillId          → slug
   name (display)        → name
   description (from SKILL.md frontmatter or page) → description
   SKILL.md body         → content
   source owner          → author
   GitHub repo URL       → source_url
   weeklyInstalls        → install_count
   category[0]           → category (pick first, default "implementation")
   install command        → install_command ("npx skills add {owner}/{repo} --skill {slug}")
   ```
5. **Write intermediate JSON** — `scripts/scraped-skills.json` for inspection before seeding
6. **Rate limiting** — 1 req/sec for GitHub, respect 429 responses with exponential backoff

## Success Criteria

- [ ] Leaderboard data extracted (200+ skills)
- [ ] SKILL.md fetched for each skill (with graceful 404 handling)
- [ ] `scraped-skills.json` written with valid SkillX schema
- [ ] Script handles network errors without crashing
