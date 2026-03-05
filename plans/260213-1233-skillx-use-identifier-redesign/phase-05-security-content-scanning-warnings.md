# Phase 5: Security — Content Scanning + CLI/UI Warnings

## Context

- [Brainstorm: Prompt Injection Safety](../reports/brainstorm-260305-skillx-use-prompt-injection-safety.md)
- [Research: Prompt Injection Defense](../reports/researcher-260305-INDEX.md)
- [Phase 1: Backend](phase-01-backend-github-scanner.md)

## Overview

- **Priority:** HIGH
- **Status:** Complete
- **Depends on:** Phase 1 (register API must exist to hook scanner)
- **Effort:** 7h
- **Description:** Add content scanner at registration time to detect prompt injection, invisible chars, and suspicious patterns. Add warning UI in CLI and web for flagged skills. Policy: warn + display (never block).

## Key Insights

- 36.8% of published AI agent skills have security flaws (Snyk ToxicSkills study)
- Claude Code has ~4.7% single-try attack success rate but 63% with 100 attempts
- No defense is perfect — goal is risk reduction through detection + user awareness
- Scan at register time (one-time cost) rather than use time (every request)
- `<system-reminder>` tags cannot be injected from external content (Anthropic strips at API level)
- Zero-width Unicode chars are the most common stealth injection vector

## Related Code Files

**Create:**

- `apps/web/app/lib/security/content-scanner.ts` — scanning logic + risk labeling

**Modify:**

- `apps/web/app/lib/db/schema.ts` — add `risk_label` column
- `apps/web/app/routes/api.skill-register.ts` — call scanner after fetch, before insert
- `apps/web/app/routes/api.skill-detail.ts` — include `risk_label` in API response
- `apps/web/app/routes/skill-detail.tsx` — warning banner for caution/danger skills
- `apps/web/app/components/skill-content-renderer.tsx` — risk badge wrapper
- `packages/cli/src/commands/use.ts` — warning banners + content boundaries

**Database:**

- New Drizzle migration `0006` — `ALTER TABLE skills ADD COLUMN risk_label TEXT DEFAULT 'unknown'`

## Implementation Steps

### Step 1: DB Migration — Add `risk_label` Column (0.5h)

Add to `schema.ts`:

```typescript
risk_label: text("risk_label").default("unknown"),
// Values: "safe" | "caution" | "danger" | "unknown"
```

Generate migration:

```bash
cd apps/web && pnpm db:generate
```

The migration adds a nullable TEXT column with default `"unknown"`. Existing skills get `"unknown"` — batch re-scan is a future task.

### Step 2: Create `content-scanner.ts` (2.5h)

New file: `apps/web/app/lib/security/content-scanner.ts`

```typescript
export type RiskLabel = "safe" | "caution" | "danger" | "unknown";

export interface ScanResult {
  label: RiskLabel;
  findings: string[];  // Human-readable list of detected issues
}

export function scanContent(content: string): ScanResult
```

**Detection rules (ordered by severity):**

DANGER triggers (any one = `danger`):

- Invisible Unicode chars: `[\u200B-\u200D\uFEFF\u2060-\u2064\u2066-\u206F]`
- ANSI escape codes: `\x1B\[[0-9;]*[A-Za-z]`
- Prompt injection patterns (case-insensitive):
  - `ignore (all )?(previous|prior|above) (instructions|prompts|rules)`
  - `you are now`, `new instructions`, `system prompt`
  - `<system`, `</system`, `<assistant`, `<human`
- JavaScript protocol in URLs: `javascript:`, `data:text/html`
- Shell command injection: `` `command` ``, `$(command)`, `eval(`, `exec(`

CAUTION triggers (2+ = `caution`, 1 = still `safe` with note):

- HTML tags: `<script`, `<iframe`, `<object`, `<embed`, `<form`
- Suspicious URL patterns: `bit.ly/`, `tinyurl.com/`, URL shorteners
- Base64 encoded blocks > 200 chars
- Excessive markdown comments (`<!-- -->` with > 500 chars hidden)
- `process.env`, `fs.readFile`, `child_process`

SAFE: No triggers detected.

**Implementation notes:**

- Pure function, no async, no dependencies — fast and testable
- Returns both label and findings array for transparency
- Strip zero-width chars from content and return sanitized version
- Keep under 150 LOC — simple regex-based detection, not ML

```typescript
export function scanContent(content: string): ScanResult {
  const findings: string[] = [];

  // DANGER checks
  const zwChars = content.match(/[\u200B-\u200D\uFEFF\u2060-\u2064\u2066-\u206F]/g);
  if (zwChars) findings.push(`danger:invisible-chars:${zwChars.length} zero-width characters`);

  const ansi = content.match(/\x1B\[[0-9;]*[A-Za-z]/g);
  if (ansi) findings.push(`danger:ansi-escape:${ansi.length} terminal escape codes`);

  // ... more checks ...

  const label = deriveLabel(findings);
  return { label, findings };
}

export function sanitizeContent(content: string): string {
  return content
    .replace(/[\u200B-\u200D\uFEFF\u2060-\u2064\u2066-\u206F]/g, "")
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}
```

### Step 3: Integrate Scanner into Register API (1h)

In `api.skill-register.ts`, after `fetchGitHubSkill()` returns and before `insertAndIndexSkill()`:

```typescript
import { scanContent, sanitizeContent } from "~/lib/security/content-scanner";

// After fetching skill data
const scanResult = scanContent(skillData.content);
const sanitizedContent = sanitizeContent(skillData.content);

// Insert with risk_label and sanitized content
await insertAndIndexSkill({
  ...skillData,
  content: sanitizedContent,  // zero-width chars stripped
  risk_label: scanResult.label,
});
```

Also integrate into the lazy-fetch path in `api.skill-detail.ts` — when stub content is re-fetched from GitHub, re-scan and update risk_label.

### Step 4: Update API Response (0.5h)

In `api.skill-detail.ts`, ensure `risk_label` is included in the skill response object. The Drizzle select already returns all columns, so this should work automatically once the schema column is added.

Verify the TypeScript type includes `risk_label`:

```typescript
// In the API response, skill object now includes:
// risk_label: "safe" | "caution" | "danger" | "unknown"
```

### Step 5: CLI Warning Banners + Content Boundaries (1.5h)

In `packages/cli/src/commands/use.ts`, modify `displaySkill()`:

```typescript
function displaySkill(skill: SkillDetails, displayId: string, options: { raw: boolean }): void {
  trackInstall(skill.slug);

  // Risk warning (non-raw mode only)
  if (!options.raw && skill.risk_label && skill.risk_label !== "safe") {
    if (skill.risk_label === "danger") {
      console.log(chalk.bgRed.white.bold(" WARNING ") +
        chalk.red(" This skill has suspicious content patterns detected."));
      console.log(chalk.red("  Review carefully before pasting into AI tools.\n"));
    } else if (skill.risk_label === "caution") {
      console.log(chalk.bgYellow.black.bold(" CAUTION ") +
        chalk.yellow(" Some content patterns flagged for review.\n"));
    }
  }

  if (options.raw) {
    // Content boundaries for raw mode (piped to AI tools)
    console.log("--- BEGIN EXTERNAL SKILL CONTENT (untrusted) ---");
    console.log(skill.content);
    console.log("--- END EXTERNAL SKILL CONTENT ---");
    return;
  }

  // Formatted output (existing display logic)
  // ... existing code ...

  // Safety tip footer
  console.log(chalk.dim("\nSource: " + (skill.source_url || "unknown")));
  console.log(chalk.dim("Tip: Review content before pasting into AI tools."));
}
```

**Key decisions:**

- Raw mode wraps with boundary markers (helps Claude Code treat as untrusted)
- Non-raw mode shows colored warning banner + safety tip footer
- `unknown` risk_label (existing unscanned skills) shows no warning — avoids false alarm
- Warning is informational, never blocks display

### Step 6: Web UI Warning Banner + Risk Badge (1h)

**In `skill-detail.tsx`** — add warning banner after header, before "Use this skill" section:

```tsx
{skill.risk_label === "danger" && (
  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
    <ShieldAlert className="mr-2 inline h-4 w-4" />
    Suspicious content patterns detected. Review carefully before use.
  </div>
)}
{skill.risk_label === "caution" && (
  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
    <ShieldAlert className="mr-2 inline h-4 w-4" />
    Some content patterns flagged for review.
  </div>
)}
```

**In `skill-content-renderer.tsx`** — add risk badge to header:

```tsx
interface Props {
  content: string;
  riskLabel?: string;
}

export function SkillContentRenderer({ content, riskLabel }: Props) {
  return (
    <div className="relative">
      {riskLabel && riskLabel !== "unknown" && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className={cn(
            "rounded-full px-2 py-0.5 font-medium",
            riskLabel === "safe" && "bg-green-500/20 text-green-400",
            riskLabel === "caution" && "bg-yellow-500/20 text-yellow-400",
            riskLabel === "danger" && "bg-red-500/20 text-red-400",
          )}>
            {riskLabel === "safe" ? "Verified Safe" : riskLabel === "caution" ? "Review Recommended" : "Suspicious"}
          </span>
        </div>
      )}
      <div className="sx-prose">
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );
}
```

## Todo List

- [x] Add `risk_label` column to skills table schema + generate migration
- [x] Create `lib/security/content-scanner.ts` with `scanContent()` + `sanitizeContent()`
- [x] Integrate scanner into `api.skill-register.ts` (after fetch, before insert)
- [x] Integrate scanner into `api.skill-detail.ts` lazy-fetch path
- [x] Verify `risk_label` included in API response
- [x] Add CLI warning banners in `displaySkill()` for caution/danger
- [x] Add content boundary markers for raw mode output
- [x] Add web warning banner in `skill-detail.tsx`
- [x] Add risk badge in `skill-content-renderer.tsx`
- [x] Test scanner against existing 30 seeded skills (expect all `safe`)
- [x] Test scanner against crafted malicious SKILL.md samples
- [x] Run `pnpm typecheck` + `pnpm build`

## Success Criteria

- All newly registered skills have `risk_label` assigned
- CLI shows colored warning for `caution`/`danger` skills
- CLI raw mode wraps content in boundary markers
- Web shows risk badge on skill detail page
- Web shows warning banner for caution/danger skills
- Zero-width chars stripped from stored content
- No false positives on existing 30 seeded skills
- Scanner detects: invisible chars, ANSI codes, injection patterns, suspicious URLs, HTML injection

## Risk Assessment

- **False positives on legit skills:** Mitigated by warn-only policy + `unknown` default for unscanned
- **Scanner bypass by sophisticated attacks:** Expected — scanner catches low-hanging fruit, not APT-level. Defense-in-depth with user education
- **Migration on existing data:** Safe — default `"unknown"`, no re-scan required immediately
- **CLI package size:** Scanning logic is server-side only, CLI just reads `risk_label` from API
- **Content boundary markers in raw mode:** May break existing piping workflows — mitigated by only adding boundaries, not changing content

## Security Considerations

- Scanner is regex-based, not ML — deterministic, fast, auditable
- Never blocks content display — user always has final say
- Zero-width char stripping is non-destructive (no visible content change)
- Risk label stored in DB, not computed at read time — consistent across CLI/web
- Future: re-scan batch job when scanner rules updated
- Future: community flagging to supplement automated detection
