# Brainstorm: `skillx use` Prompt Injection Safety

**Date:** 2026-03-05
**Status:** Agreed — ready for planning
**Related plan:** `260213-1233-skillx-use-identifier-redesign`

---

## Problem Statement

`skillx use` fetches SKILL.md content from GitHub and displays it in CLI/web. Content is stored and rendered as-is with zero sanitization. Attack vectors: invisible Unicode chars, ANSI escape codes, prompt injection patterns, nested URL injection. When users paste skill output into Claude Code or other AI tools, malicious content can hijack agent behavior.

**Real-world context:** 36.8% of published AI agent skills have security flaws (Snyk ToxicSkills study). Claude Code has ~4.7% single-try attack success rate (best-in-class) but 63% with 100 attempts.

---

## Current Gaps (from codebase scout)

| Gap | Severity | File |
|-----|----------|------|
| No content sanitization at store/display | Critical | `fetch-github-skill.ts`, `use.ts` |
| No URL validation in markdown | High | `skill-content-renderer.tsx` |
| No untrusted content warnings | High | `use.ts` (CLI), skill detail page (web) |
| No invisible char detection | Medium | Entire pipeline |
| No content size limits | Low | `api.skill-register.ts` |

---

## Evaluated Approaches

### Option A: Scan at Use Time (every `skillx use`)
- **Pros:** Always up-to-date detection, catches modified content
- **Cons:** Adds latency to every use, false positives block UX, scanning logic in CLI increases package size
- **Verdict:** Rejected — too much friction for read-heavy operation

### Option B: Scan at Publish/Register Time + Warn at Use Time
- **Pros:** One-time scan cost, clean UX at use time, catches issues at source
- **Cons:** Stale scans if GitHub content changes post-publish
- **Verdict:** SELECTED — best balance of safety and UX

### Option C: Dual-LLM Screening (Haiku pre-check)
- **Pros:** Catches sophisticated linguistic injection
- **Cons:** Adds API cost, latency, complexity; still ~85-90% failure rate against adaptive attacks
- **Verdict:** Deferred — consider for premium/verified tier later

---

## Agreed Solution

### Architecture: Scan-at-Publish + Warn-at-Use

```
PUBLISH FLOW (Layer 1 — Content Scanning):
  GitHub SKILL.md → fetchGitHubSkill() → contentScanner() → label(safe/caution/danger) → store in DB

USE FLOW (Layer 2 — CLI/UI Warnings):
  skillx use → fetch from API → check risk_label → display warning banner + content
```

### Layer 1: Content Scanning (in `skillx publish` / register API)
- Detect: zero-width Unicode chars, ANSI escape codes, HTML injection
- Detect: prompt injection patterns (`ignore previous`, `you are now`, `system prompt`)
- Detect: suspicious URL patterns (data: URIs, javascript: protocol)
- Output: `risk_label` field on skills table (`safe` | `caution` | `danger`)
- Strip zero-width chars before storing (non-destructive cleanup)
- **Scope:** `api.skill-register.ts`, new `lib/security/content-scanner.ts`

### Layer 2: CLI/UI Warnings (in `skillx use` + web)
- CLI: Warning header for untrusted/caution/danger content
- CLI: Content boundary markers (BEGIN/END EXTERNAL SKILL CONTENT)
- CLI: Safety tip about not using `--dangerously-skip-permissions`
- Web: Risk badge on skill card (green/yellow/red shield icon)
- Web: Warning banner on skill detail page for caution/danger
- **Scope:** `commands/use.ts`, `skill-detail.tsx`, `leaderboard-table.tsx`

### Policy: Warn + Display
- Always show content regardless of risk label
- User decides whether to trust and use
- Minimizes false positive impact on legit skills

---

## Integration into Identifier Redesign Plan

Add as Phase 5 (after existing 4 phases):

```
Phase 1: Backend — GitHub repo scanner + register API (existing)
Phase 2: CLI — Identifier parsing + resolution chain (existing)
Phase 3: Integration testing + edge cases (existing)
Phase 4: Docs + deploy (existing)
Phase 5: Security — Content scanning + CLI/UI warnings (NEW)
  5.1: Add risk_label column to skills table (migration)
  5.2: Create lib/security/content-scanner.ts (scanning logic)
  5.3: Integrate scanner into register API
  5.4: CLI warning banners + content boundaries in use.ts
  5.5: Web risk badges + warning banners
```

---

## What This Does NOT Cover (Future Work)

- **Layer 1 in `skillx publish`**: Full publish command doesn't exist yet; scanner integrates into register API for now
- **Canary tokens**: Deferred to post-MVP security hardening
- **Author verification**: Deferred to Phase 3 roadmap
- **MCP server security**: Needs separate plan when MCP server is built
- **Re-scan existing skills**: Batch migration script, low priority
- **Dual-LLM screening**: Consider for premium tier

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| False positives blocking legit skills | Medium | Medium | Warn-only policy, no blocking |
| Sophisticated attacks bypassing scanner | High | High | Defense-in-depth, user education |
| GitHub content changes after scan | Medium | Medium | Re-scan on content update/refetch |
| Performance overhead of scanning | Low | Low | One-time at publish, negligible |

---

## Success Criteria

- [ ] All newly registered skills have `risk_label` assigned
- [ ] CLI shows warning for `caution`/`danger` skills
- [ ] Web shows risk badge on skill cards
- [ ] Zero-width chars stripped from stored content
- [ ] No false positives on existing 30 seeded skills
- [ ] Scanner detects 5+ known injection patterns

---

## Unresolved Questions

1. Should `danger` skills be hidden from search results or just warned?
2. Re-scan frequency for existing skills when GitHub content changes?
3. Should users be able to flag suspicious skills (community moderation)?

---

## References

- Research reports: `plans/reports/researcher-260305-INDEX.md`
- Attack vectors: `plans/reports/researcher-260305-attack-vectors-reference.md`
- OWASP LLM01:2025: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- Snyk ToxicSkills: 36.8% skills compromised (empirical)
- Claude Code sandboxing: https://www.anthropic.com/engineering/claude-code-sandboxing
