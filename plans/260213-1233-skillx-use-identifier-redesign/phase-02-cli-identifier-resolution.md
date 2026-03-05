# Phase 2: CLI — Identifier Parsing + Resolution Chain

## Context

- [Brainstorm report](../reports/brainstorm-260213-1233-skillx-use-identifier-redesign.md)
- [Phase 1: Backend](phase-01-backend-github-scanner.md)

## Overview

- **Priority:** HIGH
- **Status:** Pending
- **Depends on:** Phase 1 (register API changes)
- **Description:** Rewrite CLI `use` command identifier parsing to support 2-part (`author/skill`) and 3-part (`org/repo/skill`) formats with proper resolution chain.

## Key Insights

- Current `parseGitHubSlug()` only detects 2-part `x/y` — no 3-part support
- Current `toApiSlug()` joins `owner-repo` — wrong, should be `author-skillname`
- Resolution must handle: spaces (search), 3-part (GitHub source), 2-part (skill lookup), single word (slug)
- `search --use` and `searchAndUse()` pass `author/name` — already correct format for 2-part

## Related Code Files

**Modify:**
- `packages/cli/src/commands/use.ts` — rewrite parsing + resolution chain

**No changes needed:**
- `packages/cli/src/lib/api-client.ts` — generic, works as-is
- `packages/cli/src/lib/search-api.ts` — returns author+name, works as-is
- `packages/cli/src/commands/search.ts` — passes `author/name` format, works as-is

## Implementation Steps

### Step 1: Replace identifier parsing functions

Remove `parseGitHubSlug()` and `toApiSlug()`. Replace with:

```typescript
type IdentifierType = 'search' | 'three-part' | 'two-part' | 'slug';

interface ParsedIdentifier {
  type: IdentifierType;
  // For three-part: org, repo, skillName
  // For two-part: author, skillName
  // For slug: raw slug
  // For search: query string
  parts: string[];
}

function parseIdentifier(input: string): ParsedIdentifier {
  if (input.includes(' ')) return { type: 'search', parts: [input] };

  const slashParts = input.split('/');
  if (slashParts.length === 3) return { type: 'three-part', parts: slashParts };
  if (slashParts.length === 2) return { type: 'two-part', parts: slashParts };
  return { type: 'slug', parts: [input] };
}
```

### Step 2: Rewrite `useSkillBySlug()` resolution chain

Rename to `resolveAndUseSkill()` for clarity. Full resolution:

```typescript
export async function resolveAndUseSkill(
  identifier: string,
  options: { raw: boolean }
): Promise<void> {
  const parsed = parseIdentifier(identifier);

  switch (parsed.type) {
    case 'search':
      return searchAndUse(parsed.parts[0], options.raw);

    case 'three-part': {
      const [org, repo, skillName] = parsed.parts;
      const slug = `${org}-${skillName}`.toLowerCase();
      // DB lookup first, then register from specific path
      return resolveBySlug(slug, identifier, options, {
        registerFallback: { owner: org, repo, skill_path: skillName }
      });
    }

    case 'two-part': {
      const [author, skillName] = parsed.parts;
      const slug = `${author}-${skillName}`.toLowerCase();
      // DB lookup first, then scan repo for skills
      return resolveBySlug(slug, identifier, options, {
        registerFallback: { owner: author, repo: skillName, scan: true }
      });
    }

    case 'slug':
      // Direct slug lookup, fallback to search on 404
      return resolveBySlug(parsed.parts[0], identifier, options, {
        searchFallback: true
      });
  }
}
```

### Step 3: Implement `resolveBySlug()` helper

Core resolution with fallbacks:

```typescript
async function resolveBySlug(
  slug: string,
  displayId: string,
  options: { raw: boolean },
  fallback: {
    registerFallback?: { owner: string; repo: string; skill_path?: string; scan?: boolean };
    searchFallback?: boolean;
  }
): Promise<void> {
  const spinner = ora(`Fetching skill: ${displayId}...`).start();

  try {
    const res = await apiRequest<{ skill: SkillDetails }>(`/api/skills/${slug}`);
    spinner.stop();
    displaySkill(res.skill, displayId, options);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) {
      spinner.stop();
      throw err;
    }

    // 404 — try fallbacks
    if (fallback.registerFallback) {
      spinner.text = `Skill not found. Scanning GitHub...`;
      const registerRes = await apiRequest<RegisterResponse>('/api/skills/register', {
        method: 'POST',
        body: JSON.stringify(fallback.registerFallback),
      });
      spinner.stop();
      handleRegisterResult(registerRes, displayId, options);
    } else if (fallback.searchFallback) {
      spinner.stop();
      console.log(chalk.dim(`Skill "${displayId}" not found, searching...`));
      await searchAndUse(displayId, options.raw);
    } else {
      spinner.stop();
      throw err;
    }
  }
}
```

### Step 4: Handle register response (single vs multi-skill)

```typescript
interface RegisterResponse {
  // Single skill mode
  skill?: SkillDetails;
  created?: boolean;
  // Scan mode (multi-skill)
  skills?: Array<{ slug: string; name: string; author: string }>;
  registered?: number;
  skipped?: number;
}

function handleRegisterResult(
  res: RegisterResponse,
  displayId: string,
  options: { raw: boolean }
): void {
  // Single skill
  if (res.skill) {
    if (res.created) {
      console.log(chalk.green(`Registered new skill from GitHub: ${displayId}`));
    }
    displaySkill(res.skill, displayId, options);
    return;
  }

  // Multi-skill scan result
  if (res.skills && res.skills.length > 0) {
    console.log(chalk.bold.green(`\nFound ${res.skills.length} skill(s) in repo:\n`));
    res.skills.forEach((s) => {
      console.log(`  ${chalk.cyan(`${s.author}/${s.name}`)}`);
    });
    console.log(chalk.dim(`\nUse ${chalk.cyan(`skillx use ${displayId}/<skill-name>`)} to use a specific skill`));
    if (res.registered) console.log(chalk.dim(`(${res.registered} newly registered, ${res.skipped || 0} already existed)`));
    return;
  }

  console.log(chalk.yellow(`\nNo skills found in ${displayId}`));
}
```

### Step 5: Extract `displaySkill()` helper

Move display logic out of the current inline code into a clean function:

```typescript
function displaySkill(skill: SkillDetails, displayId: string, options: { raw: boolean }): void {
  // Fire-and-forget install tracking
  trackInstall(skill.slug);

  if (options.raw) {
    console.log(skill.content);
    return;
  }

  // Formatted output (existing code moved here)
  // ...
}
```

### Step 6: Update command registration

```typescript
export const useCommand = new Command('use')
  .description('Use a skill by author/name, org/repo/skill, slug, or keywords')
  .argument('<identifier>', 'author/skill, org/repo/skill, slug, or search keywords')
  .option('-r, --raw', 'Output raw content only (for piping)')
  .option('-s, --search', 'Force search mode')
  .action(async (identifier: string, options: { raw?: boolean; search?: boolean }) => {
    const raw = options.raw ?? false;

    try {
      if (options.search) {
        await searchAndUse(identifier, raw);
        return;
      }
      await resolveAndUseSkill(identifier, { raw });
    } catch (error) {
      // Error handling (existing code)
    }
  });
```

### Step 7: Update `search --use` integration

In `search.ts`, the `--use` flag passes `${top.author}/${top.name}` which is already 2-part format. This naturally resolves via the new chain. No changes needed.

## Todo List

- [ ] Replace `parseGitHubSlug()` + `toApiSlug()` with `parseIdentifier()`
- [ ] Rewrite `useSkillBySlug()` → `resolveAndUseSkill()` with switch-based resolution
- [ ] Implement `resolveBySlug()` with register/search fallbacks
- [ ] Handle multi-skill register response (list skills)
- [ ] Extract `displaySkill()` helper
- [ ] Update command description + argument help text
- [ ] Verify `search --use` still works with 2-part format

## Success Criteria

- `skillx use author/skill-name` → DB lookup by slug `author-skillname`
- `skillx use org/repo/skill` → DB lookup `org-skill`, fallback register with skill_path
- `skillx use "multi word"` → search mode
- `skillx use slug` → direct lookup, search fallback on 404
- `skillx use org/repo` (2-part, no match) → scan repo, list all skills
- `skillx search "x" --use` → still works (passes author/name)

## Risk Assessment

- **Breaking change:** `useSkillBySlug` is exported and used by `search.ts`. Rename export, update import. Low risk.
- **Three-part URL encoding:** Slashes in API calls (`/api/skills/org-skill`) — no issue since slug uses hyphens not slashes.
