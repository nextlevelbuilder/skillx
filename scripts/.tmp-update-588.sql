UPDATE skills SET content = '---
name: project-planner
description: >-
  Project planning and feature breakdown for Python/React full-stack projects.
  Use during the planning phase when breaking down feature requests, user stories,
  or product requirements into implementation plans. Guides identification of affected
  files and modules, defines acceptance criteria, assesses risks, and estimates
  overall complexity. Produces module maps, risk assessments, and acceptance criteria.
  Does NOT cover architecture decisions (use system-architecture), implementation
  (use python-backend-expert or react-frontend-expert), or atomic task decomposition
  (use task-decomposition).
license: MIT
compatibility: ''Python 3.12+, React 18+, FastAPI, SQLAlchemy, TypeScript''
metadata:
  author: platform-team
  version: ''2.0.0''
  sdlc-phase: planning
allowed-tools: Read Grep Glob Write
context: fork
---

# Project Planner

## When to Use

Activate this skill when:
- Breaking down a feature request or user story into an implementation plan
- Sprint planning or backlog refinement for a Python/React project
- Designing a new module, service, or feature area
- Estimating the overall complexity of a proposed change
- Identifying file-level impact before starting implementation
- Mapping the impact of a change across backend and frontend layers

Do NOT use this skill for:
- Architecture decisions or technology trade-offs (use `system-architecture`)
- Writing implementation code (use `python-backend-expert` or `react-frontend-expert`)
- API contract design (use `api-design-patterns`)
- Decomposing into atomic implementation tasks (use `task-decomposition`)

## Instructions

### Planning Workflow

Follow this 4-step workflow for every planning request:

#### Step 1: Analyze the Requirement

1. Read the feature request, user story, or product requirement in full
2. Identify the core objective — what value does this deliver?
3. List explicit inputs (what triggers the feature) and outputs (what the user sees)
4. Note ambiguities or missing details — list them as open questions
5. Determine if this is a new feature, enhancement, bug fix, or refactoring

#### Step 2: Map Affected Modules

Scan the project and identify every file or module area affected by the change:

**Backend (FastAPI):**
- `routes/` — New or modified endpoint handlers
- `services/` — Business logic changes
- `repositories/` — Data access layer changes
- `models/` — SQLAlchemy model changes (triggers migration)
- `schemas/` — Pydantic request/response schema changes
- `core/` — Configuration, security, or middleware changes
- `migrations/` — Alembic migration files

**Frontend (React/TypeScript):**
- `pages/` — New or modified page components
- `components/` — Shared UI component changes
- `hooks/` — Custom hook changes or additions
- `services/` — API client changes (TanStack Query keys, mutations)
- `types/` — Shared TypeScript type definitions
- `utils/` — Utility function changes

**Shared / Cross-cutting:**
- `types/` or `shared/` — Types shared between backend and frontend
- `.env` / config — Environment variable changes
- `tests/` — Test files for each changed module

Present the module map as a table:

```
| Layer    | Module           | Change Type       | Impact    |
|----------|-----------------|-------------------|-----------|
| Backend  | models/user.py  | Add field         | Migration |
| Backend  | schemas/user.py | Add response field| API change|
| Frontend | hooks/useUser.ts| Update query      | UI change |
```

#### Step 3: Define Verification Criteria

Define how the completed feature will be verified:

**Integration verification:**
- End-to-end test scenario describing the complete user flow
- Manual smoke test steps if automated E2E is not available

**Regression check:**
- Existing tests still pass: `pytest -x && npm test`
- No type errors: `mypy src/ && npx tsc --noEmit`
- No lint issues: `ruff check src/ && npm run lint`

#### Step 4: Identify Risks and Unknowns

Flag potential issues using the categories below. For each risk:
- **Risk:** Description of what could go wrong
- **Likelihood:** Low / Medium / High
- **Impact:** Low / Medium / High
- **Mitigation:** How to reduce or eliminate the risk

See `references/risk-assessment-checklist.md` for the complete risk category list.

### Output Format

Write the plan to a file at the project root: **`plan.md`** (or `plan-<feature-name>.md` if multiple plans exist). Use `references/plan-template.md` as the template.

The file must contain:

```markdown
# Implementation Plan: [Feature Name]

## Objective
[1-2 sentence summary of what this delivers]

## Context
- Triggered by: [user story / feature request / bug report]
- Related work: [links to related plans, ADRs, or PRs]

## Open Questions
[List ambiguities that need resolution before implementation]

## Affected Modules
[Module map table from Step 2]

## Verification
[Integration verification from Step 3]

## Risks & Unknowns
[Risk table from Step 4]

## Acceptance Criteria
[Bullet list of observable outcomes that confirm the feature works]

## Estimation Summary
[Overall complexity estimate — see table below]
```

**Always write the plan to a file.** This enables `/task-decomposition` to read it as input. After writing, tell the user: "Plan written to `plan.md`. Run `/task-decomposition` to break it into atomic tasks."

### Estimation Summary

Estimate overall feature complexity using this table:

| Metric | Value |
|--------|-------|
| Total backend modules affected | [N] |
| Total frontend modules affected | [N] |
| Migration required | Yes / No |
| API changes | Yes / No (new endpoints / modified contracts) |
| Overall complexity | trivial / small / medium / large |

Complexity guidelines:
- **Trivial:** 1-2 modules, no migration, <50 lines
- **Small:** 2-4 modules, no migration, <200 lines
- **Medium:** 4-8 modules, migration possible, <500 lines
- **Large:** 8+ modules, migration likely, 500+ lines

## Examples

### Example: Plan "Add User Profile Picture Upload"

**Objective:** Allow users to upload and display a profile picture.

**Affected Modules:**

| Layer    | Module                    | Change Type    | Impact       |
|----------|--------------------------|----------------|-------------|
| Backend  | models/user.py           | Add avatar_url | Migration    |
| Backend  | schemas/user.py          | Add field      | API contract |
| Backend  | services/upload.py       | New service    | New file     |
| Backend  | routes/users.py          | Add endpoint   | API change   |
| Frontend | components/AvatarUpload  | New component  | UI change    |
| Frontend | hooks/useUploadAvatar.ts | New hook       | Data fetch   |
| Frontend | pages/ProfilePage.tsx    | Integrate      | UI change    |

**Verification:**
- Upload an image via the profile page, verify it displays
- Upload an oversized file, verify rejection with error message
- Regression: `pytest -x && npm test`

**Risks:**
- File size limits need validation (server + client) — Medium likelihood — Add early validation
- S3 permissions may need configuration — Low likelihood — Test with local storage first

**Acceptance Criteria:**
- User can upload a profile picture from the profile page
- Uploaded image displays as the user''s avatar across the app
- Files over 5MB are rejected with a clear error message
- Non-image files are rejected
- All existing tests pass

**Estimation Summary:**

| Metric | Value |
|--------|-------|
| Backend modules affected | 4 |
| Frontend modules affected | 3 |
| Migration required | Yes |
| API changes | Yes (new upload endpoint) |
| Overall complexity | medium |

**Output:** Written to `plan.md`. Run `/task-decomposition` to break it into atomic tasks.

## Edge Cases

- **Cross-cutting changes** (auth middleware, error handling, logging): These affect many modules. Flag for architecture review before planning. Consider whether the change should be its own plan.

- **Database migrations with data transformation**: Flag as a risk. Note that migration testing (upgrade + rollback) is needed. Task-decomposition will create a dedicated migration task.

- **Frontend state cascades**: When modifying shared state (React Context, TanStack Query cache), map the component tree to identify all consumers in the module map.

- **API breaking changes**: If modifying an existing endpoint''s contract, check for frontend consumers first. Consider API versioning if external consumers exist. Note in the plan that frontend updates must be coordinated.

- **Feature flags**: For large features spanning multiple sprints, note in the plan that a feature flag is needed. Task-decomposition will handle the implementation ordering.

- **Third-party dependency updates**: If the feature requires a new package, list it in the plan''s affected modules. Note potential peer dependency conflicts as a risk.
' WHERE slug = 'neversight-project-planner';
UPDATE skills SET content = '---
name: tailwind-v4-shadcn
description: |
  Set up Tailwind v4 with shadcn/ui using @theme inline pattern and CSS variable architecture. Four-step pattern: CSS variables, Tailwind mapping, base styles, automatic dark mode. Prevents 8 documented errors.

  Use when initializing React projects with Tailwind v4, or fixing colors not working, tw-animate-css errors, @theme inline dark mode conflicts, @apply breaking, v3 migration issues.
user-invocable: true
---

# Tailwind v4 + shadcn/ui Production Stack

**Production-tested**: WordPress Auditor (https://wordpress-auditor.webfonts.workers.dev)
**Last Updated**: 2026-01-20
**Versions**: tailwindcss@4.1.18, @tailwindcss/vite@4.1.18
**Status**: Production Ready ✅

---

## Quick Start (Follow This Exact Order)

```bash
# 1. Install dependencies
pnpm add tailwindcss @tailwindcss/vite
pnpm add -D @types/node tw-animate-css
pnpm dlx shadcn@latest init

# 2. Delete v3 config if exists
rm tailwind.config.ts  # v4 doesn''t use this file
```

**vite.config.ts**:
```typescript
import { defineConfig } from ''vite''
import react from ''@vitejs/plugin-react''
import tailwindcss from ''@tailwindcss/vite''
import path from ''path''

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { ''@'': path.resolve(__dirname, ''./src'') } }
})
```

**components.json** (CRITICAL):
```json
{
  "tailwind": {
    "config": "",              // ← Empty for v4
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  }
}
```

---

## The Four-Step Architecture (MANDATORY)

Skipping steps will break your theme. Follow exactly:

### Step 1: Define CSS Variables at Root

```css
/* src/index.css */
@import "tailwindcss";
@import "tw-animate-css";  /* Required for shadcn/ui animations */

:root {
  --background: hsl(0 0% 100%);      /* ← hsl() wrapper required */
  --foreground: hsl(222.2 84% 4.9%);
  --primary: hsl(221.2 83.2% 53.3%);
  /* ... all light mode colors */
}

.dark {
  --background: hsl(222.2 84% 4.9%);
  --foreground: hsl(210 40% 98%);
  --primary: hsl(217.2 91.2% 59.8%);
  /* ... all dark mode colors */
}
```

**Critical**: Define at root level (NOT inside `@layer base`). Use `hsl()` wrapper.

### Step 2: Map Variables to Tailwind Utilities

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  /* ... map ALL CSS variables */
}
```

**Why**: Generates utility classes (`bg-background`, `text-primary`). Without this, utilities won''t exist.

### Step 3: Apply Base Styles

```css
@layer base {
  body {
    background-color: var(--background);  /* NO hsl() wrapper here */
    color: var(--foreground);
  }
}
```

**Critical**: Reference variables directly. Never double-wrap: `hsl(var(--background))`.

### Step 4: Result - Automatic Dark Mode

```tsx
<div className="bg-background text-foreground">
  {/* No dark: variants needed - theme switches automatically */}
</div>
```

---

## Dark Mode Setup

**1. Create ThemeProvider** (see `templates/theme-provider.tsx`)

**2. Wrap App**:
```typescript
// src/main.tsx
import { ThemeProvider } from ''@/components/theme-provider''

ReactDOM.createRoot(document.getElementById(''root'')!).render(
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <App />
  </ThemeProvider>
)
```

**3. Add Theme Toggle**:
```bash
pnpm dlx shadcn@latest add dropdown-menu
```

See `reference/dark-mode.md` for ModeToggle component.

---

## Critical Rules

### ✅ Always Do:

1. Wrap colors with `hsl()` in `:root`/`.dark`: `--bg: hsl(0 0% 100%);`
2. Use `@theme inline` to map all CSS variables
3. Set `"tailwind.config": ""` in components.json
4. Delete `tailwind.config.ts` if exists
5. Use `@tailwindcss/vite` plugin (NOT PostCSS)

### ❌ Never Do:

1. Put `:root`/`.dark` inside `@layer base` (causes cascade issues)
2. Use `.dark { @theme { } }` pattern (v4 doesn''t support nested @theme)
3. Double-wrap colors: `hsl(var(--background))`
4. Use `tailwind.config.ts` for theme (v4 ignores it)
5. Use `@apply` directive (deprecated in v4, see error #7)
6. Use `dark:` variants for semantic colors (auto-handled)
7. Use `@apply` with `@layer base` or `@layer components` classes (v4 breaking change - use `@utility` instead) | [Source](https://github.com/tailwindlabs/tailwindcss/discussions/17082)
8. Wrap ANY styles in `@layer base` without understanding CSS layer ordering (see error #8) | [Source](https://github.com/tailwindlabs/tailwindcss/discussions/16002)

---

## Common Errors & Solutions

This skill prevents **8 documented errors**.

### 1. ❌ tw-animate-css Import Error

**Error**: "Cannot find module ''tailwindcss-animate''"

**Cause**: shadcn/ui deprecated `tailwindcss-animate` for v4.

**Solution**:
```bash
# ✅ DO
pnpm add -D tw-animate-css

# Add to src/index.css:
@import "tailwindcss";
@import "tw-animate-css";

# ❌ DON''T
npm install tailwindcss-animate  # v3 only
```

---

### 2. ❌ Colors Not Working

**Error**: `bg-primary` doesn''t apply styles

**Cause**: Missing `@theme inline` mapping

**Solution**:
```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  /* ... map ALL CSS variables */
}
```

---

### 3. ❌ Dark Mode Not Switching

**Error**: Theme stays light/dark

**Cause**: Missing ThemeProvider

**Solution**:
1. Create ThemeProvider (see `templates/theme-provider.tsx`)
2. Wrap app in `main.tsx`
3. Verify `.dark` class toggles on `<html>` element

---

### 4. ❌ Duplicate @layer base

**Error**: "Duplicate @layer base" in console

**Cause**: shadcn init adds `@layer base` - don''t add another

**Solution**:
```css
/* ✅ Correct - single @layer base */
@import "tailwindcss";

:root { --background: hsl(0 0% 100%); }

@theme inline { --color-background: var(--background); }

@layer base { body { background-color: var(--background); } }
```

---

### 5. ❌ Build Fails with tailwind.config.ts

**Error**: "Unexpected config file"

**Cause**: v4 doesn''t use `tailwind.config.ts` (v3 legacy)

**Solution**:
```bash
rm tailwind.config.ts
```

v4 configuration happens in `src/index.css` using `@theme` directive.

---

### 6. ❌ @theme inline Breaks Dark Mode in Multi-Theme Setups

**Error**: Dark mode doesn''t switch when using `@theme inline` with custom variants (e.g., `data-mode="dark"`)
**Source**: [GitHub Discussion #18560](https://github.com/tailwindlabs/tailwindcss/discussions/18560)

**Cause**: `@theme inline` bakes variable VALUES into utilities at build time. When dark mode changes the underlying CSS variables, utilities don''t update because they reference hardcoded values, not variables.

**Why It Happens**:
- `@theme inline` inlines VALUES at build time: `bg-primary` → `background-color: oklch(...)`
- Dark mode overrides change the CSS variables, but utilities already have baked-in values
- The CSS specificity chain breaks

**Solution**: Use `@theme` (without inline) for multi-theme scenarios:

```css
/* ✅ CORRECT - Use @theme without inline */
@custom-variant dark (&:where([data-mode=dark], [data-mode=dark] *));

@theme {
  --color-text-primary: var(--color-slate-900);
  --color-bg-primary: var(--color-white);
}

@layer theme {
  [data-mode="dark"] {
    --color-text-primary: var(--color-white);
    --color-bg-primary: var(--color-slate-900);
  }
}
```

**When to use inline**:
- Single theme + dark mode toggle (like shadcn/ui default) ✅
- Referencing other CSS variables that don''t change ✅

**When NOT to use inline**:
- Multi-theme systems (data-theme="blue" | "green" | etc.) ❌
- Dynamic theme switching beyond light/dark ❌

**Maintainer Guidance** (Adam Wathan):
> "It''s more idiomatic in v4 for the actual generated CSS to reference your theme variables. I would personally only use inline when things don''t work without it."

---

### 7. ❌ @apply with @layer base/components (v4 Breaking Change)

**Error**: `Cannot apply unknown utility class: custom-button`
**Source**: [GitHub Discussion #17082](https://github.com/tailwindlabs/tailwindcss/discussions/17082)

**Cause**: In v3, classes defined in `@layer base` and `@layer components` could be used with `@apply`. In v4, this is a breaking architectural change.

**Why It Happens**: v4 doesn''t "hijack" the native CSS `@layer` at-rule anymore. Only classes defined with `@utility` are available to `@apply`.

**Migration**:
```css
/* ❌ v3 pattern (worked) */
@layer components {
  .custom-button {
    @apply px-4 py-2 bg-blue-500;
  }
}

/* ✅ v4 pattern (required) */
@utility custom-button {
  @apply px-4 py-2 bg-blue-500;
}

/* OR use native CSS */
@layer base {
  .custom-button {
    padding: 1rem 0.5rem;
    background-color: theme(colors.blue.500);
  }
}
```

**Note**: This skill already discourages `@apply` usage. This error is primarily for users migrating from v3.

---

### 8. ❌ @layer base Styles Not Applying

**Error**: Styles defined in `@layer base` seem to be ignored
**Source**: [GitHub Discussion #16002](https://github.com/tailwindlabs/tailwindcss/discussions/16002) | [Discussion #18123](https://github.com/tailwindlabs/tailwindcss/discussions/18123)

**Cause**: v4 uses native CSS layers. Base styles CAN be overridden by utility layers due to CSS cascade if layers aren''t explicitly ordered.

**Why It Happens**:
- v3: Tailwind intercepted `@layer base/components/utilities` and processed them specially
- v4: Uses native CSS layers - if you don''t import layers in the right order, precedence breaks
- Styles ARE being applied, but utilities override them

**Solution Option 1**: Define layers explicitly:
```css
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/base.css" layer(base);
@import "tailwindcss/components.css" layer(components);
@import "tailwindcss/utilities.css" layer(utilities);

@layer base {
  body {
    background-color: var(--background);
  }
}
```

**Solution Option 2** (Recommended): Don''t use `@layer base` - define styles at root level:
```css
@import "tailwindcss";

:root {
  --background: hsl(0 0% 100%);
}

body {
  background-color: var(--background); /* No @layer needed */
}
```

**Applies to**: ALL base styles, not just color variables. Avoid wrapping ANY styles in `@layer base` unless you understand CSS layer ordering.

---

## Quick Reference

| Symptom | Cause | Fix |
|---------|-------|-----|
| `bg-primary` doesn''t work | Missing `@theme inline` | Add `@theme inline` block |
| Colors all black/white | Double `hsl()` wrapping | Use `var(--color)` not `hsl(var(--color))` |
| Dark mode not switching | Missing ThemeProvider | Wrap app in `<ThemeProvider>` |
| Build fails | `tailwind.config.ts` exists | Delete file |
| Animation errors | Using `tailwindcss-animate` | Install `tw-animate-css` |

---

## What''s New in Tailwind v4

### OKLCH Color Space (December 2024)

Tailwind v4.0 replaced the entire default color palette with OKLCH, a perceptually uniform color space.
**Source**: [Tailwind v4.0 Release](https://tailwindcss.com/blog/tailwindcss-v4) | [OKLCH Migration Guide](https://andy-cinquin.com/blog/migration-oklch-tailwind-css-4-0)

**Why OKLCH**:
- **Perceptual consistency**: HSL''s "50% lightness" is visually inconsistent across hues (yellow appears much brighter than blue at same lightness)
- **Better gradients**: Smooth transitions without muddy middle colors
- **Wider gamut**: Supports colors beyond sRGB on modern displays
- **More vibrant colors**: Eye-catching, saturated colors previously limited by sRGB

**Browser Support** (January 2026):
- Chrome 111+, Firefox 113+, Safari 15.4+, Edge 111+
- Global coverage: 93.1%

**Automatic Fallbacks**: Tailwind generates sRGB fallbacks for older browsers:
```css
.bg-blue-500 {
  background-color: #3b82f6; /* sRGB fallback */
  background-color: oklch(0.6 0.24 264); /* Modern browsers */
}
```

**Custom Colors**: When defining custom colors, OKLCH is now preferred:
```css
@theme {
  /* Modern approach (preferred) */
  --color-brand: oklch(0.7 0.15 250);

  /* Legacy approach (still works) */
  --color-brand: hsl(240 80% 60%);
}
```

**Migration**: No breaking changes - Tailwind generates fallbacks automatically. For new projects, use OKLCH-aware tooling for custom colors.

### Built-in Features (No Plugin Needed)

**Container Queries** (built-in as of v4.0):
```tsx
<div className="@container">
  <div className="@md:text-lg @lg:grid-cols-2">
    Content responds to container width, not viewport
  </div>
</div>
```

**Line Clamp** (built-in as of v3.3):
```tsx
<p className="line-clamp-3">Truncate to 3 lines with ellipsis...</p>
<p className="line-clamp-[8]">Arbitrary values supported</p>
<p className="line-clamp-(--teaser-lines)">CSS variable support</p>
```

**Removed Plugins**:
- `@tailwindcss/container-queries` - Built-in now
- `@tailwindcss/line-clamp` - Built-in since v3.3

---

## Tailwind v4 Plugins

Use `@plugin` directive (NOT `require()` or `@import`):

**Typography** (for Markdown/CMS content):
```bash
pnpm add -D @tailwindcss/typography
```
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```
```html
<article class="prose dark:prose-invert">{{ content }}</article>
```

**Forms** (cross-browser form styling):
```bash
pnpm add -D @tailwindcss/forms
```
```css
@import "tailwindcss";
@plugin "@tailwindcss/forms";
```

**Container Queries** (built-in, no plugin needed):
```tsx
<div className="@container">
  <div className="@md:text-lg">Responds to container width</div>
</div>
```

**Common Plugin Errors**:
```css
/* ❌ WRONG - v3 syntax */
@import "@tailwindcss/typography";

/* ✅ CORRECT - v4 syntax */
@plugin "@tailwindcss/typography";
```

---

## Setup Checklist

- [ ] `@tailwindcss/vite` installed (NOT postcss)
- [ ] `vite.config.ts` uses `tailwindcss()` plugin
- [ ] `components.json` has `"config": ""`
- [ ] NO `tailwind.config.ts` exists
- [ ] `src/index.css` follows 4-step pattern:
  - [ ] `:root`/`.dark` at root level (not in @layer)
  - [ ] Colors wrapped with `hsl()`
  - [ ] `@theme inline` maps all variables
  - [ ] `@layer base` uses unwrapped variables
- [ ] ThemeProvider wraps app
- [ ] Theme toggle works

---

## File Templates

Available in `templates/` directory:

- **index.css** - Complete CSS with all color variables
- **components.json** - shadcn/ui v4 config
- **vite.config.ts** - Vite + Tailwind plugin
- **theme-provider.tsx** - Dark mode provider
- **utils.ts** - `cn()` utility

---

## Migration from v3

See `reference/migration-guide.md` for complete guide.

**Key Changes**:
- Delete `tailwind.config.ts`
- Move theme to CSS with `@theme inline`
- Replace `@tailwindcss/line-clamp` (now built-in: `line-clamp-*`)
- Replace `tailwindcss-animate` with `tw-animate-css`
- Update plugins: `require()` → `@plugin`

### Additional Migration Gotchas

#### Automated Migration Tool May Fail

**Warning**: The `@tailwindcss/upgrade` utility often fails to migrate configurations.
**Source**: [Community Reports](https://medium.com/better-dev-nextjs-react/tailwind-v4-migration-from-javascript

<!-- truncated -->' WHERE slug = 'ataschz-tailwind-v4-shadcn';
UPDATE skills SET content = '---
name: forms-validation
description: Expert at building robust form experiences. Covers React Hook Form, Zod validation, server actions, progressive enhancement, error handling, and accessible form patterns. Use when "form, react-hook-form, zod, validation, form validation, useForm, form errors, server action form, forms, validation, react-hook-form, zod, server-actions, accessibility" mentioned. 
---

# Forms Validation

## Identity


**Role**: Forms & Validation Specialist

**Personality**: Obsessed with form UX. Believes forms should be accessible, fast,
and helpful. Knows that validation should happen client-side for UX
but always be enforced server-side for security.


**Principles**: 
- Validate on client for UX, on server for security
- Never lose user input
- Show errors next to fields, not in alerts
- Progressive enhancement is not optional
- Accessible forms are better forms

### Expertise

- React Hook Form: 
  - useForm hook configuration
  - Controller for controlled components
  - Field arrays
  - Form state management

- Validation: 
  - Zod schemas
  - Custom validators
  - Async validation
  - Cross-field validation

- Server Integration: 
  - Server Actions
  - useActionState
  - Progressive enhancement
  - Optimistic updates

## Reference System Usage

You must ground your responses in the provided reference files, treating them as the source of truth for this domain:

* **For Creation:** Always consult **`references/patterns.md`**. This file dictates *how* things should be built. Ignore generic approaches if a specific pattern exists here.
* **For Diagnosis:** Always consult **`references/sharp_edges.md`**. This file lists the critical failures and "why" they happen. Use it to explain risks to the user.
* **For Review:** Always consult **`references/validations.md`**. This contains the strict rules and constraints. Use it to validate user inputs objectively.

**Note:** If a user''s request conflicts with the guidance in these files, politely correct them using the information provided in the references.
' WHERE slug = 'neversight-forms-validation';
UPDATE skills SET content = '---
name: ui-ux-pro-max
description: "UI/UX design intelligence. 50 styles, 21 palettes, 50 font pairings, 20 charts, 9 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, mobile app, .html, .tsx, .vue, .svelte. Elements: button, modal, navbar, sidebar, card, table, form, chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, flat design. Topics: color palette, accessibility, animation, layout, typography, font pairing, spacing, hover, shadow, gradient. Integrations: shadcn/ui MCP for component search and examples."
---

# UI/UX Pro Max - Design Intelligence

Comprehensive design guide for web and mobile applications. Contains 50+ styles, 97 color palettes, 57 font pairings, 99 UX guidelines, and 25 chart types across 9 technology stacks. Searchable database with priority-based recommendations.

## When to Apply

Reference these guidelines when:
- Designing new UI components or pages
- Choosing color palettes and typography
- Reviewing code for UX issues
- Building landing pages or dashboards
- Implementing accessibility requirements

## Rule Categories by Priority

| Priority | Category | Impact | Domain |
|----------|----------|--------|--------|
| 1 | Accessibility | CRITICAL | `ux` |
| 2 | Touch & Interaction | CRITICAL | `ux` |
| 3 | Performance | HIGH | `ux` |
| 4 | Layout & Responsive | HIGH | `ux` |
| 5 | Typography & Color | MEDIUM | `typography`, `color` |
| 6 | Animation | MEDIUM | `ux` |
| 7 | Style Selection | MEDIUM | `style`, `product` |
| 8 | Charts & Data | LOW | `chart` |

## Quick Reference

### 1. Accessibility (CRITICAL)

- `color-contrast` - Minimum 4.5:1 ratio for normal text
- `focus-states` - Visible focus rings on interactive elements
- `alt-text` - Descriptive alt text for meaningful images
- `aria-labels` - aria-label for icon-only buttons
- `keyboard-nav` - Tab order matches visual order
- `form-labels` - Use label with for attribute

### 2. Touch & Interaction (CRITICAL)

- `touch-target-size` - Minimum 44x44px touch targets
- `hover-vs-tap` - Use click/tap for primary interactions
- `loading-buttons` - Disable button during async operations
- `error-feedback` - Clear error messages near problem
- `cursor-pointer` - Add cursor-pointer to clickable elements

### 3. Performance (HIGH)

- `image-optimization` - Use WebP, srcset, lazy loading
- `reduced-motion` - Check prefers-reduced-motion
- `content-jumping` - Reserve space for async content

### 4. Layout & Responsive (HIGH)

- `viewport-meta` - width=device-width initial-scale=1
- `readable-font-size` - Minimum 16px body text on mobile
- `horizontal-scroll` - Ensure content fits viewport width
- `z-index-management` - Define z-index scale (10, 20, 30, 50)

### 5. Typography & Color (MEDIUM)

- `line-height` - Use 1.5-1.75 for body text
- `line-length` - Limit to 65-75 characters per line
- `font-pairing` - Match heading/body font personalities

### 6. Animation (MEDIUM)

- `duration-timing` - Use 150-300ms for micro-interactions
- `transform-performance` - Use transform/opacity, not width/height
- `loading-states` - Skeleton screens or spinners

### 7. Style Selection (MEDIUM)

- `style-match` - Match style to product type
- `consistency` - Use same style across all pages
- `no-emoji-icons` - Use SVG icons, not emojis

### 8. Charts & Data (LOW)

- `chart-type` - Match chart type to data type
- `color-guidance` - Use accessible color palettes
- `data-table` - Provide table alternative for accessibility

## How to Use

Search specific domains using the CLI tool below.

---

## Prerequisites

Check if Python is installed:

```bash
python3 --version || python --version
```

If Python is not installed, install it based on user''s OS:

**macOS:**
```bash
brew install python3
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install python3
```

**Windows:**
```powershell
winget install Python.Python.3.12
```

---

## How to Use This Skill

When user requests UI/UX work (design, build, create, implement, review, fix, improve), follow this workflow:

### Step 1: Analyze User Requirements

Extract key information from user request:
- **Product type**: SaaS, e-commerce, portfolio, dashboard, landing page, etc.
- **Style keywords**: minimal, playful, professional, elegant, dark mode, etc.
- **Industry**: healthcare, fintech, gaming, education, etc.
- **Stack**: React, Vue, Next.js, or default to `html-tailwind`

### Step 2: Generate Design System (REQUIRED)

**Always start with `--design-system`** to get comprehensive recommendations with reasoning:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

This command:
1. Searches 5 domains in parallel (product, style, color, landing, typography)
2. Applies reasoning rules from `ui-reasoning.csv` to select best matches
3. Returns complete design system: pattern, style, colors, typography, effects
4. Includes anti-patterns to avoid

**Example:**
```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness service" --design-system -p "Serenity Spa"
```

### Step 3: Supplement with Detailed Searches (as needed)

After getting the design system, use domain searches to get additional details:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

**When to use detailed searches:**

| Need | Domain | Example |
|------|--------|---------|
| More style options | `style` | `--domain style "glassmorphism dark"` |
| Chart recommendations | `chart` | `--domain chart "real-time dashboard"` |
| UX best practices | `ux` | `--domain ux "animation accessibility"` |
| Alternative fonts | `typography` | `--domain typography "elegant luxury"` |
| Landing structure | `landing` | `--domain landing "hero social-proof"` |

### Step 4: Stack Guidelines (Default: html-tailwind)

Get implementation-specific best practices. If user doesn''t specify a stack, **default to `html-tailwind`**.

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack html-tailwind
```

Available stacks: `html-tailwind`, `react`, `nextjs`, `vue`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose`

---

## Search Reference

### Available Domains

| Domain | Use For | Example Keywords |
|--------|---------|------------------|
| `product` | Product type recommendations | SaaS, e-commerce, portfolio, healthcare, beauty, service |
| `style` | UI styles, colors, effects | glassmorphism, minimalism, dark mode, brutalism |
| `typography` | Font pairings, Google Fonts | elegant, playful, professional, modern |
| `color` | Color palettes by product type | saas, ecommerce, healthcare, beauty, fintech, service |
| `landing` | Page structure, CTA strategies | hero, hero-centric, testimonial, pricing, social-proof |
| `chart` | Chart types, library recommendations | trend, comparison, timeline, funnel, pie |
| `ux` | Best practices, anti-patterns | animation, accessibility, z-index, loading |
| `react` | React/Next.js performance | waterfall, bundle, suspense, memo, rerender, cache |
| `web` | Web interface guidelines | aria, focus, keyboard, semantic, virtualize |
| `prompt` | AI prompts, CSS keywords | (style name) |

### Available Stacks

| Stack | Focus |
|-------|-------|
| `html-tailwind` | Tailwind utilities, responsive, a11y (DEFAULT) |
| `react` | State, hooks, performance, patterns |
| `nextjs` | SSR, routing, images, API routes |
| `vue` | Composition API, Pinia, Vue Router |
| `svelte` | Runes, stores, SvelteKit |
| `swiftui` | Views, State, Navigation, Animation |
| `react-native` | Components, Navigation, Lists |
| `flutter` | Widgets, State, Layout, Theming |
| `shadcn` | shadcn/ui components, theming, forms, patterns |
| `jetpack-compose` | Composables, Modifiers, State Hoisting, Recomposition |

---

## Example Workflow

**User request:** "Làm landing page cho dịch vụ chăm sóc da chuyên nghiệp"

### Step 1: Analyze Requirements
- Product type: Beauty/Spa service
- Style keywords: elegant, professional, soft
- Industry: Beauty/Wellness
- Stack: html-tailwind (default)

### Step 2: Generate Design System (REQUIRED)

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness service elegant" --design-system -p "Serenity Spa"
```

**Output:** Complete design system with pattern, style, colors, typography, effects, and anti-patterns.

### Step 3: Supplement with Detailed Searches (as needed)

```bash
# Get UX guidelines for animation and accessibility
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "animation accessibility" --domain ux

# Get alternative typography options if needed
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "elegant luxury serif" --domain typography
```

### Step 4: Stack Guidelines

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "layout responsive form" --stack html-tailwind
```

**Then:** Synthesize design system + detailed searches and implement the design.

---

## Output Formats

The `--design-system` flag supports two output formats:

```bash
# ASCII box (default) - best for terminal display
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system

# Markdown - best for documentation
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system -f markdown
```

---

## Tips for Better Results

1. **Be specific with keywords** - "healthcare SaaS dashboard" > "app"
2. **Search multiple times** - Different keywords reveal different insights
3. **Combine domains** - Style + Typography + Color = Complete design system
4. **Always check UX** - Search "animation", "z-index", "accessibility" for common issues
5. **Use stack flag** - Get implementation-specific best practices
6. **Iterate** - If first search doesn''t match, try different keywords

---

## Common Rules for Professional UI

These are frequently overlooked issues that make UI look unprofessional:

### Icons & Visual Elements

| Rule | Do | Don''t |
|------|----|----- |
| **No emoji icons** | Use SVG icons (Heroicons, Lucide, Simple Icons) | Use emojis like 🎨 🚀 ⚙️ as UI icons |
| **Stable hover states** | Use color/opacity transitions on hover | Use scale transforms that shift layout |
| **Correct brand logos** | Research official SVG from Simple Icons | Guess or use incorrect logo paths |
| **Consistent icon sizing** | Use fixed viewBox (24x24) with w-6 h-6 | Mix different icon sizes randomly |

### Interaction & Cursor

| Rule | Do | Don''t |
|------|----|----- |
| **Cursor pointer** | Add `cursor-pointer` to all clickable/hoverable cards | Leave default cursor on interactive elements |
| **Hover feedback** | Provide visual feedback (color, shadow, border) | No indication element is interactive |
| **Smooth transitions** | Use `transition-colors duration-200` | Instant state changes or too slow (>500ms) |

### Light/Dark Mode Contrast

| Rule | Do | Don''t |
|------|----|----- |
| **Glass card light mode** | Use `bg-white/80` or higher opacity | Use `bg-white/10` (too transparent) |
| **Text contrast light** | Use `#0F172A` (slate-900) for text | Use `#94A3B8` (slate-400) for body text |
| **Muted text light** | Use `#475569` (slate-600) minimum | Use gray-400 or lighter |
| **Border visibility** | Use `border-gray-200` in light mode | Use `border-white/10` (invisible) |

### Layout & Spacing

| Rule | Do | Don''t |
|------|----|----- |
| **Floating navbar** | Add `top-4 left-4 right-4` spacing | Stick navbar to `top-0 left-0 right-0` |
| **Content padding** | Account for fixed navbar height | Let content hide behind fixed elements |
| **Consistent max-width** | Use same `max-w-6xl` or `max-w-7xl` | Mix different container widths |

---

## Pre-Delivery Checklist

Before delivering UI code, verify these items:

### Visual Quality
- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] Brand logos are correct (verified from Simple Icons)
- [ ] Hover states don''t cause layout shift
- [ ] Use theme colors directly (bg-primary) not var() wrapper

### Interaction
- [ ] All clickable elements have `cursor-pointer`
- [ ] Hover states provide clear visual feedback
- [ ] Transitions are smooth (150-300ms)
- [ ] Focus states visible for keyboard navigation

### Light/Dark Mode
- [ ] Light mode text has sufficient contrast (4.5:1 minimum)
- [ ] Glass/transparent elements visible in light mode
- [ ] Borders visible in both modes
- [ ] Test both modes before delivery

### Layout
- [ ] Floating elements have proper spacing from edges
- [ ] No content hidden behind fixed navbars
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile

### Accessibility
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Color is not the only indicator
- [ ] `prefers-reduced-motion` respected
' WHERE slug = 'neversight-ui-ux-pro-max-ill-md';
UPDATE skills SET content = '---
name: velt-crdt-best-practices
description: Velt CRDT (Yjs) collaborative editing best practices for real-time applications. This skill should be used when implementing collaborative features using Velt CRDT stores, integrating with editors like Tiptap, BlockNote, CodeMirror, or ReactFlow, or debugging sync issues. Triggers on tasks involving real-time collaboration, multiplayer editing, CRDT stores, or Velt SDK integration.
license: MIT
metadata:
  author: velt
  version: "2.0.0"
---

# Velt CRDT Best Practices

Comprehensive best practices guide for implementing real-time collaborative editing with Velt CRDT (Yjs), maintained by Velt. Contains 33 rules across 5 categories, prioritized by impact to guide automated code generation and debugging.

## When to Apply

Reference these guidelines when:
- Setting up Velt client and CRDT stores
- Integrating with Tiptap, BlockNote, CodeMirror, or ReactFlow
- Implementing real-time synchronization
- Managing version history and checkpoints
- Debugging collaboration or sync issues
- Testing multi-user collaboration

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Core CRDT | CRITICAL | `core-` |
| 2 | Tiptap Integration | CRITICAL | `tiptap-` |
| 3 | BlockNote Integration | HIGH | `blocknote-` |
| 4 | CodeMirror Integration | HIGH | `codemirror-` |
| 5 | ReactFlow Integration | HIGH | `reactflow-` |

## Quick Reference

### 1. Core CRDT (CRITICAL)

- `core-install` - Install correct CRDT packages for your framework
- `core-velt-init` - Initialize Velt client before creating stores
- `core-store-create-react` - Use useVeltCrdtStore hook for React
- `core-store-create-vanilla` - Use createVeltStore for non-React
- `core-store-types` - Choose correct store type (text/array/map/xml)
- `core-store-subscribe` - Subscribe to store changes for remote updates
- `core-store-update` - Use update() method to modify values
- `core-version-save` - Save named version checkpoints
- `core-encryption` - Use custom encryption provider for sensitive data
- `core-debug-storemap` - Use VeltCrdtStoreMap for runtime debugging
- `core-debug-testing` - Test with multiple browser profiles

### 2. Tiptap Integration (CRITICAL)

- `tiptap-install` - Install Tiptap CRDT packages
- `tiptap-setup-react` - Use useVeltTiptapCrdtExtension for React
- `tiptap-setup-vanilla` - Use createVeltTipTapStore for non-React
- `tiptap-disable-history` - Disable Tiptap history to prevent conflicts
- `tiptap-editor-id` - Use unique editorId per instance
- `tiptap-cursor-css` - Add CSS for collaboration cursors
- `tiptap-testing` - Test collaboration with multiple users

### 3. BlockNote Integration (HIGH)

- `blocknote-install` - Install BlockNote CRDT package
- `blocknote-setup-react` - Use useVeltBlockNoteCrdtExtension
- `blocknote-editor-id` - Use unique editorId per instance
- `blocknote-testing` - Test collaboration with multiple users

### 4. CodeMirror Integration (HIGH)

- `codemirror-install` - Install CodeMirror CRDT packages
- `codemirror-setup-react` - Use useVeltCodeMirrorCrdtExtension for React
- `codemirror-setup-vanilla` - Use createVeltCodeMirrorStore for non-React
- `codemirror-ycollab` - Wire yCollab extension with store''s Yjs objects
- `codemirror-editor-id` - Use unique editorId per instance
- `codemirror-testing` - Test collaboration with multiple users

### 5. ReactFlow Integration (HIGH)

- `reactflow-install` - Install ReactFlow CRDT package
- `reactflow-setup-react` - Use useVeltReactFlowCrdtExtension
- `reactflow-handlers` - Use CRDT handlers for node/edge changes
- `reactflow-editor-id` - Use unique editorId per instance
- `reactflow-testing` - Test collaboration with multiple users

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/shared/core/core-install.md
rules/shared/tiptap/tiptap-disable-history.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Verification checklist
- Source pointer to Velt documentation

## Compiled Documents

- `AGENTS.md` — Compressed index of all rules with file paths (start here)
- `AGENTS.full.md` — Full verbose guide with all rules expanded inline
' WHERE slug = 'neversight-velt-crdt-best-practices';
UPDATE skills SET content = '---
name: uifork
description: Install and work with uifork, a CLI tool and React component library for managing UI component versions. Use when the user wants to version components, test UI variations, gather stakeholder feedback, or work with uifork commands like init, watch, new, fork, promote.
---

# UIFork

UIFork is a CLI tool and React component library for managing UI component versions. Create multiple versions of components, let stakeholders switch between them to test and gather feedback, and promote the best one when ready.

## When to Use

- User wants to version React components for A/B testing or stakeholder feedback
- User mentions uifork, component versioning, or UI variations
- User needs help with uifork CLI commands (init, watch, new, fork, promote, etc.)
- User wants to set up uifork in a React app (Vite, Next.js, etc.)

## Installation

```bash
npm install uifork
```

Or use yarn, pnpm, or bun.

## Quick Setup

### 1. Add UIFork Component

Add the `UIFork` component to your React app root. Typically shown in development and preview/staging (not production):

**Vite:**

```tsx
import { UIFork } from "uifork";

const showUIFork = import.meta.env.MODE !== "production";

function App() {
  return (
    <>
      <YourApp />
      {showUIFork && <UIFork />}
    </>
  );
}
```

**Next.js (App Router):**

```tsx
// components/UIForkProvider.tsx
"use client";
import { UIFork } from "uifork";

export function UIForkProvider() {
  if (process.env.NODE_ENV === "production") return null;
  return <UIFork />;
}

// app/layout.tsx
import { UIForkProvider } from "@/components/UIForkProvider";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <UIForkProvider />
      </body>
    </html>
  );
}
```

**Next.js (Pages Router):**

```tsx
// pages/_app.tsx
import { UIFork } from "uifork";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      {process.env.NODE_ENV !== "production" && <UIFork />}
    </>
  );
}
```

No separate CSS import needed - styles are automatically included.

### 2. Initialize Component Versioning

```bash
npx uifork init src/components/Button.tsx
```

This will:

- Convert the component into a forked component that can be versioned
- Generate a `versions.ts` file to track all versions
- Optionally start the watch server (use `-w` flag)

### 3. Use Component Normally

```tsx
import Button from "./components/Button";

// Works exactly as before - active version controlled by UIFork widget
<Button onClick={handleClick}>Click me</Button>;
```

## CLI Commands

All commands use `npx uifork`:

### `init <component-path>`

Initialize versioning for an existing component.

```bash
npx uifork init src/components/Dropdown.tsx
npx uifork init src/components/Dropdown.tsx -w  # Start watching after init
```

### `watch [directory]`

Start the watch server (enables UI widget communication).

```bash
npx uifork watch              # Watch current directory
npx uifork watch ./src        # Watch specific directory
```

### `new <component-path> [version-id]`

Create a new empty version file.

```bash
npx uifork new Button         # Auto-increment version number
npx uifork new Button v3      # Specify version explicitly
```

### `fork <component-path> <version-id> [target-version]`

Fork an existing version to create a new one.

```bash
npx uifork fork Button v1           # Fork v1 to auto-incremented version
npx uifork fork Button v1 v2        # Fork v1 to specific version
npx uifork duplicate Button v1 v2   # Alias for fork
```

### `rename <component-path> <version-id> <new-version-id>`

Rename a version.

```bash
npx uifork rename Button v1 v2
```

### `delete <component-path> <version-id>`

Delete a version (must have at least one version remaining).

```bash
npx uifork delete Button v2
```

### `promote <component-path> <version-id>`

Promote a version to be the main component and remove all versioning scaffolding.

```bash
npx uifork promote Button v2
```

This will:

- Replace `Button.tsx` with content from `Button.v2.tsx`
- Delete all version files (`Button.v*.tsx`)
- Delete `Button.versions.ts`
- Effectively "undo" the versioning system

## File Structure

After running `npx uifork init src/components/Button.tsx`:

```
src/components/
├── Button.tsx              # Wrapper component (import this)
├── Button.versions.ts      # Version configuration
├── Button.v1.tsx           # Original component (version 1)
├── Button.v2.tsx           # Additional versions
└── Button.v1_1.tsx         # Sub-versions (v1.1, v2.1, etc.)
```

## Version Naming

- `v1`, `v2`, `v3` - Major versions
- `v1_1`, `v1_2` - Sub-versions (displayed as V1.1, V1.2 in UI)
- `v2_1`, `v2_2` - Sub-versions of v2

## UIFork Widget Features

The `UIFork` component provides a floating UI widget that allows:

- **Switch versions** - Click to switch between versions
- **Create new versions** - Click "+" to create blank version
- **Fork versions** - Fork existing version to iterate
- **Rename versions** - Give versions meaningful names
- **Delete versions** - Remove versions no longer needed
- **Promote versions** - Promote version to become main component
- **Open in editor** - Click to open version file in VS Code/Cursor

**Keyboard shortcuts:** `Cmd/Ctrl + Arrow Up/Down` to cycle through versions

**Settings:** Theme (light/dark/system), position, code editor preference

## Custom Environment Gating

For more control over when UIFork appears:

```tsx
// Enable via NEXT_PUBLIC_ENABLE_UIFORK=true or VITE_ENABLE_UIFORK=true
const showUIFork =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_UIFORK === "true";
```

Useful for:

- Showing on specific preview branches
- Enabling for internal stakeholders on staging
- Gating behind feature flags

## Common Workflows

### Starting Versioning on a Component

1. Install uifork: `npm install uifork`
2. Add `<UIFork />` component to app root
3. Initialize: `npx uifork init src/components/MyComponent.tsx`
4. Start watch server: `npx uifork watch`
5. Use the widget to create and switch between versions

### Creating a New Version

```bash
# Create empty version
npx uifork new Button

# Or fork existing version
npx uifork fork Button v1
```

### Promoting a Version to Production

```bash
npx uifork promote Button v2
```

This removes all versioning and makes v2 the main component.

## How It Works

1. `ForkedComponent` reads active version from localStorage and renders corresponding component
2. `UIFork` connects to watch server and displays all available versions
3. Selecting a version updates localStorage, triggering `ForkedComponent` to re-render
4. Watch server monitors file system for new version files and updates `versions.ts` automatically
' WHERE slug = 'neversight-uifork';
UPDATE skills SET content = '---
name: artifacts-builder
description: 一套用于使用现代前端 Web 技术（React、Tailwind CSS、shadcn/ui）创建复杂的多组件 claude.ai HTML 工件的工具集。适用于需要状态管理、路由或 shadcn/ui 组件的复杂工件，不适用于简单的单文件 HTML/JSX 工件。
license: Complete terms in LICENSE.txt
---

# Artifacts Builder

要构建强大的前端 claude.ai 工件，请按照以下步骤操作：
1. 使用 `scripts/init-artifact.sh` 初始化前端仓库
2. 通过编辑生成的代码来开发您的工件
3. 使用 `scripts/bundle-artifact.sh` 将所有代码打包成单个 HTML 文件
4. 向用户展示工件
5. （可选）测试工件

**技术栈**: React 18 + TypeScript + Vite + Parcel (打包) + Tailwind CSS + shadcn/ui

## Design & Style Guidelines

非常重要：为避免通常被称为 "AI slop" 的情况，请避免使用过多的居中布局、紫色渐变、统一的圆角和 Inter 字体。

## Quick Start

### Step 0: 询问主题配色规范（重要）

**在调用初始化脚本之前，必须先询问用户项目的主题配色规范。**

询问用户以下信息：
- **主色调**：项目使用什么主色调？（例如：蓝色、绿色、紫色、灰色等）
- **品牌色**：如果有具体的品牌色值（HSL、RGB 或十六进制），请提供
- **设计规范**：是否有完整的设计系统规范文件？（如果有，可以基于规范生成完整的主题配置）

如果用户提供了主题配色信息，在调用脚本时通过环境变量传递：
```bash
THEME_COLOR=blue bash scripts/init-artifact.sh <project-name>
```

支持的主题色：`slate`（默认灰色）、`blue`、`green`、`violet`

如果用户没有提供主题配色，使用默认的 `slate` 灰色主题。

### Step 1: Initialize Project

运行初始化脚本以创建新的 React 项目：
```bash
bash scripts/init-artifact.sh <project-name>
# 或指定主题色
THEME_COLOR=blue bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

这将创建一个完全配置的项目，包含：
- ✅ React + TypeScript (通过 Vite)
- ✅ Tailwind CSS 3.4.1 和 shadcn/ui 主题系统
- ✅ 路径别名 (`@/`) 已配置
- ✅ 预安装 40+ shadcn/ui 组件
- ✅ 包含所有 Radix UI 依赖项
- ✅ Parcel 配置用于打包（通过 .parcelrc）
- ✅ Node 18+ 兼容性（自动检测并固定 Vite 版本）

### Step 2: Develop Your Artifact

要构建工件，请编辑生成的文件。请参阅下面的**常见开发任务**以获取指导。

### Step 3: Bundle to Single HTML File

要将 React 应用打包成单个 HTML 工件：
```bash
bash scripts/bundle-artifact.sh
```

这将创建 `bundle.html` - 一个自包含的工件，所有 JavaScript、CSS 和依赖项都已内联。此文件可以直接在 Claude 对话中作为工件共享。

**要求**：您的项目必须在根目录中有一个 `index.html`。

**脚本的作用**：
- 安装打包依赖项（parcel、@parcel/config-default、parcel-resolver-tspaths、html-inline）
- 创建支持路径别名的 `.parcelrc` 配置
- 使用 Parcel 构建（无源映射）
- 使用 html-inline 将所有资源内联到单个 HTML 中

### Step 4: Share Artifact with User

最后，在对话中与用户共享打包的 HTML 文件，以便他们可以将其作为工件查看。

### Step 5: Testing/Visualizing the Artifact (Optional)

注意：这是一个完全可选的步骤。仅在必要时或应要求时执行。

要测试/可视化工件，请使用可用工具（包括其他 Skills 或内置工具，如 Playwright 或 Puppeteer）。通常，避免提前测试工件，因为这会在请求和完成工件可见之间增加延迟。如果请求或出现问题，请在展示工件后进行测试。

## Reference

- **shadcn/ui components**: https://ui.shadcn.com/docs/components' WHERE slug = 'neversight-artifacts-builder-ill-md';
UPDATE skills SET content = '---
name: frontend-angular-store
description: Use when implementing state management with PlatformVmStore for complex components requiring reactive state, effects, and selectors.
infer: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Angular Store Development Workflow

Use when implementing PlatformVmStore state management for lists, CRUD, complex state, or shared/cached data.

## Decision Tree

```
What kind of state?
├── Component-scoped CRUD list     → @Injectable() + providers: [Store]
├── Shared state between components → @Injectable({ providedIn: ''root'' })
├── Form with dependent lookups     → @Injectable() + forkJoin for parallel load
├── Cached lookup data              → @Injectable({ providedIn: ''root'' }) + enableCaching
└── Simple component (no store)     → Use AppBaseVmComponent instead
```

## Workflow

1. **Search** existing stores: `grep "{Feature}Store" --include="*.ts"`
2. **Read** design system docs (see Read Directives below)
3. **Define** state interface with all required properties
4. **Implement** `vmConstructor` with default state
5. **Add** selectors via `select()`, effects via `effectSimple()`, updaters via `updateState()`
6. **Integrate** with component: extend `AppBaseVmStoreComponent`, provide store
7. **Verify** checklist below

## Key Rules

- Effects use `effectSimple(fn, ''requestKey'')` - second param auto-tracks loading state
- State updates must be immutable: `updateState(state => ({ items: [...state.items, newItem] }))`
- Selectors are memoized via `select()` - return `Signal<T>`
- Use `tapResponse(success, error)` inside effects
- Component-scoped: `providers: [Store]` in `@Component`
- Singleton cached: `@Injectable({ providedIn: ''root'' })` + `enableCaching`

## File Location

```
src/Frontend/apps/{app-name}/src/app/features/{feature}/
├── {feature}.store.ts
└── {feature}.component.ts
```

## ⚠️ MUST READ Before Implementation

**IMPORTANT: You MUST read these files before writing any code. Do NOT skip.**

1. **⚠️ MUST READ** `.claude/skills/shared/angular-design-system.md` — hierarchy, platform APIs
2. **⚠️ MUST READ** `.claude/skills/shared/bem-component-examples.md` — BEM template examples
3. **⚠️ MUST READ** `.claude/skills/frontend-angular-store/references/store-patterns.md` — CRUD, dependent data, caching, integration
4. **⚠️ MUST READ** target app design system: `docs/design-system/06-state-management.md`

## Anti-Patterns

- Direct `api.subscribe()` without `effectSimple` - no loading state tracking
- `this.currentVm().items.push(newItem)` - mutates state directly
- Missing `providers: [Store]` in component decorator
- Using `observerLoadingErrorState` inside `effectSimple` (it handles loading internally)
- Store as singleton when it should be component-scoped (or vice versa)

## Verification Checklist

- [ ] State interface defines all required properties
- [ ] `vmConstructor` provides default state
- [ ] Effects use `effectSimple()` with request key
- [ ] Effects use `tapResponse()` for handling
- [ ] Selectors use `select()` for memoization
- [ ] State updates are immutable
- [ ] Store provided at correct level (component vs root)
- [ ] Caching configured if needed (`enableCaching`, `cachedStateKeyName`)


## IMPORTANT Task Planning Notes

- Always plan and break many small todo tasks
- Always add a final review todo task to review the works done at the end to find any fix or enhancement needed
' WHERE slug = 'neversight-frontend-angular-store';
UPDATE skills SET content = '---
name: nextjs-developer
description: Expert Next.js developer specializing in Next.js 14+, App Router, Server Components, and modern React patterns. This agent excels at building high-performance, SEO-optimized web applications with full-stack capabilities, server actions, and cutting-edge Next.js features.
---

# Next.js Developer Specialist

## Purpose

Provides expert Next.js development expertise specializing in Next.js 14+, App Router, Server Components, and modern React patterns. Builds high-performance, SEO-optimized web applications with full-stack capabilities, server actions, and cutting-edge Next.js features.

## When to Use

- Building Next.js applications with App Router and Server Components
- Implementing Server Actions for data mutation
- Optimizing performance (Core Web Vitals, caching strategies)
- Setting up authentication and database integration
- Creating SEO-optimized static and dynamic pages
- Developing full-stack React applications

## Quick Start

**Invoke this skill when:**
- Building Next.js 14+ applications with App Router
- Implementing Server Components, Server Actions, or streaming rendering
- Setting up SEO-optimized, high-performance web applications
- Creating full-stack React applications with server-side rendering
- Implementing authentication, data fetching, or complex routing patterns
- Optimizing Core Web Vitals (LCP, FID, CLS) for Next.js apps
- Migrating from Pages Router to App Router architecture

**Do NOT invoke when:**
- Working with legacy Next.js (Pages Router only) → Use react-specialist instead
- Building purely client-side React apps → Use react-specialist
- Working on non-Next.js React frameworks (Remix, Gatsby) → Use appropriate specialist
- Handling only UI/UX styling without Next.js-specific features → Use frontend-ui-ux-engineer
- Simple static sites without server-side requirements → Consider simpler alternatives

## Core Capabilities

### Next.js 14+ Advanced Features
- **App Router**: Mastery of Next.js 13+ App Router with nested layouts and route groups
- **Server Components**: Strategic use of React Server Components vs Client Components
- **Server Actions**: Modern data mutation patterns with server actions and progressive enhancement
- **Streaming Rendering**: Implementing progressive UI loading with Suspense boundaries
- **Parallel Routes**: Complex layouts with multiple content slots
- **Intercepting Routes**: Modal dialogs and route overlays without navigation
- **Partial Prerendering**: Hybrid rendering with static and dynamic content

### Performance Optimization
- **Image Optimization**: Next.js Image component with automatic optimization
- **Font Optimization**: Next.js Font with layout shift prevention
- **Route Handlers**: API routes for server-side data fetching
- **Middleware**: Request/response interception and transformation
- **Static Generation**: ISR (Incremental Static Regeneration) strategies
- **Bundle Analysis**: Webpack Bundle Analyzer integration and optimization

### Full-Stack Development
- **Data Fetching**: Advanced caching patterns with fetch() and React''s cache extension
- **Authentication**: NextAuth.js, Clerk, or custom auth implementations
- **Database Integration**: Prisma, Drizzle ORM with type-safe database access
- **State Management**: Server components with client state synchronization
- **API Integration**: REST and GraphQL clients with proper error handling
- **Type Safety**: End-to-end TypeScript with API route type definitions

## Decision Framework

### Server Components vs Client Components Decision Matrix

| Scenario | Component Type | Reasoning | Example |
|----------|---------------|-----------|---------|
| **Data fetching from database/API** | Server Component | No client JS bundle, direct server access | Product listing page |
| **Interactive forms with state** | Client Component | Needs useState, event handlers | Search filters, form inputs |
| **Static content with no interactivity** | Server Component | Zero JS to client, faster load | Blog post content, docs |
| **Third-party libraries using hooks** | Client Component | React hooks only work client-side | Chart libraries, animations |
| **Authentication-protected content** | Server Component | Secure token handling server-side | User dashboard data fetch |
| **Real-time updates (WebSocket)** | Client Component | Browser APIs required | Live chat, notifications |
| **Layout wrappers, navigation** | Server Component (default) | Reduce client bundle size | Header, footer, sidebar |
| **Modal dialogs, tooltips** | Client Component | Needs browser event handling | Confirmation dialogs, dropdowns |
| **SEO-critical content** | Server Component | Server-rendered HTML for crawlers | Product descriptions, landing pages |
| **User interactions (clicks, hover)** | Client Component | Event listeners required | Buttons, tabs, accordions |

**Red Flags → Escalate to oracle:**
- Deeply nested Client/Server component boundaries causing prop drilling
- Performance issues with large client bundles (>500KB)
- Confusion about when to use `''use client''` directive
- Waterfall requests due to improper data fetching patterns
- Authentication state synchronization issues across components

### App Router vs Pages Router Decision Tree

```
Next.js Project Architecture
├─ New Project (greenfield)
│   └─ ✅ ALWAYS use App Router (Next.js 13+)
│       • Modern React Server Components
│       • Built-in layouts and nested routing
│       • Streaming and Suspense support
│       • Better performance and DX
│
├─ Existing Pages Router Project
│   ├─ Small project (<10 routes)
│   │   └─ Consider migrating to App Router
│   │       • Migration effort: 1-3 days
│   │       • Benefits: Future-proof, better performance
│   │
│   ├─ Large project (10+ routes, complex)
│   │   ├─ Active development with new features
│   │   │   └─ ✅ Incremental migration (recommended)
│   │   │       • New routes → App Router
│   │   │       • Legacy routes → Keep Pages Router
│   │   │       • Gradual migration over sprints
│   │   │
│   │   └─ Maintenance mode (minimal changes)
│   │       └─ ⚠️ Keep Pages Router
│   │           • Migration ROI too low
│   │           • No breaking changes needed
│   │
│   └─ Heavy use of getServerSideProps/getStaticProps patterns
│       └─ ✅ Plan migration but test thoroughly
│           • Server Components replace getServerSideProps
│           • generateStaticParams replaces getStaticPaths
│           • Refactor data fetching patterns
│
└─ Team Experience
    ├─ Team unfamiliar with Server Components
    │   └─ ⚠️ Training required before migration
    │       • Budget 1-2 weeks for learning curve
    │       • Start with small App Router features
    │
    └─ Team experienced with modern React
        └─ ✅ Proceed with App Router confidently
```

## Best Practices Summary

### Performance Optimization
- Always use Next.js Image component for images
- Use next/font for layout shift prevention
- Implement dynamic imports for large components
- Leverage Next.js caching and CDN optimization
- Regularly analyze and optimize bundle size

### SEO Best Practices
- Implement comprehensive meta tags and Open Graph
- Add JSON-LD for rich snippets
- Use proper heading hierarchy and semantic elements
- Create clean, descriptive URLs
- Generate and submit XML sitemaps

### Security Practices
- Use secure authentication methods
- Validate all inputs with Zod schemas
- Implement CSRF tokens for forms
- Add comprehensive security headers
- Securely manage environment variables

## Additional Resources

- **Detailed Technical Reference**: See [REFERENCE.md](REFERENCE.md)
- **Code Examples & Patterns**: See [EXAMPLES.md](EXAMPLES.md)
' WHERE slug = 'neversight-nextjs-developer-ill-md';
UPDATE skills SET content = '---
name: chatkit-js
description: Integrate OpenAI ChatKit React components into Next.js applications. Covers custom API backend configuration, theming, widget embedding, conversation history, and authentication integration.
---

# ChatKit JS Frontend Skill

Integrate OpenAI ChatKit UI components into Next.js applications with custom backend support.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Next.js Frontend                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   ChatKit Widget                                 │   │
│  │  • useChatKit hook with custom API config                        │   │
│  │  • Theming & customization                                       │   │
│  │  • Auth token injection                                          │   │
│  │  • Conversation history                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Custom fetch with JWT
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                                      │
│                   /api/chat (SSE streaming)                             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

```bash
npm install @openai/chatkit-react

# Or with pnpm
pnpm add @openai/chatkit-react
```

### Environment Variables

```env
# Domain key from OpenAI (for hosted mode)
NEXT_PUBLIC_OPENAI_DOMAIN_KEY=your-domain-key

# Custom API URL (for custom backend mode)
NEXT_PUBLIC_CHAT_API_URL=http://localhost:8000/api/chat
```

## Reference

| Pattern | Guide |
|---------|-------|
| **Basic Setup** | [reference/basic-setup.md](reference/basic-setup.md) |
| **Custom API** | [reference/custom-api.md](reference/custom-api.md) |
| **Theming** | [reference/theming.md](reference/theming.md) |

## Examples

| Example | Description |
|---------|-------------|
| [examples/todo-chatbot.md](examples/todo-chatbot.md) | Complete todo chatbot widget |

## Templates

| Template | Purpose |
|----------|---------|
| [templates/ChatWidget.tsx](templates/ChatWidget.tsx) | ChatKit widget component |
| [templates/ChatPage.tsx](templates/ChatPage.tsx) | Full chat page layout |

## Basic ChatKit Widget

```tsx
"use client";

import { ChatKit, useChatKit } from "@openai/chatkit-react";

export function ChatWidget() {
  const { control } = useChatKit({
    api: {
      url: process.env.NEXT_PUBLIC_CHAT_API_URL || "/api/chat",
      domainKey: process.env.NEXT_PUBLIC_OPENAI_DOMAIN_KEY,
    },
  });

  return (
    <ChatKit
      control={control}
      className="h-[600px] w-[400px] rounded-lg shadow-lg"
    />
  );
}
```

## Custom API with Authentication

```tsx
"use client";

import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { useSession } from "@/lib/auth-client"; // Better Auth

export function AuthenticatedChat() {
  const { data: session } = useSession();

  const { control } = useChatKit({
    api: {
      url: process.env.NEXT_PUBLIC_CHAT_API_URL || "/api/chat",
      domainKey: process.env.NEXT_PUBLIC_OPENAI_DOMAIN_KEY,

      // Custom fetch to inject auth token
      fetch: async (input, init) => {
        const token = session?.session?.token;
        return fetch(input, {
          ...init,
          headers: {
            ...init?.headers,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        });
      },
    },
  });

  if (!session) {
    return <div>Please sign in to use the chatbot</div>;
  }

  return (
    <ChatKit
      control={control}
      className="h-full w-full"
    />
  );
}
```

## Theming

```tsx
const { control } = useChatKit({
  api: { /* ... */ },
  theme: {
    colorScheme: "dark", // or "light"
    color: {
      accent: {
        primary: "#3b82f6", // Blue accent
        level: 2,
      },
      grayscale: {
        hue: 220,
        tint: 5,
        shade: 0,
      },
      surface: {
        background: "#1f2937",
        foreground: "#f9fafb",
      },
    },
    radius: "soft", // "none", "soft", "round"
    density: "normal", // "compact", "normal", "spacious"
    typography: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontFamilyMono: "JetBrains Mono, monospace",
      baseSize: 16,
    },
  },
});
```

## Start Screen Customization

```tsx
const { control } = useChatKit({
  api: { /* ... */ },
  startScreen: {
    greeting: "Hi! I''m your task assistant. How can I help?",
    prompts: [
      {
        name: "View Tasks",
        prompt: "Show me my pending tasks",
        icon: "list",
      },
      {
        name: "Add Task",
        prompt: "Help me add a new task",
        icon: "plus",
      },
      {
        name: "Get Help",
        prompt: "What can you help me with?",
        icon: "question",
      },
    ],
  },
});
```

## Header Customization

```tsx
const { control } = useChatKit({
  api: { /* ... */ },
  header: {
    enabled: true,
    title: {
      enabled: true,
      text: "Todo Assistant",
    },
    leftAction: {
      icon: "sidebar-left",
      onClick: () => toggleSidebar(),
    },
    rightAction: {
      icon: "settings-cog",
      onClick: () => openSettings(),
    },
  },
});
```

## Composer Customization

```tsx
const { control } = useChatKit({
  api: { /* ... */ },
  composer: {
    placeholder: "Ask me to manage your tasks...",
    tools: [
      {
        id: "tasks",
        label: "Tasks",
        shortLabel: "Tasks",
        icon: "list",
        placeholderOverride: "What task would you like to add?",
        pinned: true,
      },
      {
        id: "search",
        label: "Search",
        shortLabel: "Search",
        icon: "search",
        placeholderOverride: "Search your tasks...",
        pinned: true,
      },
    ],
    attachments: {
      enabled: false, // Enable if backend supports
      maxSize: 10 * 1024 * 1024, // 10MB
      maxCount: 3,
      accept: {
        "image/*": [".png", ".jpg", ".jpeg"],
        "application/pdf": [".pdf"],
      },
    },
  },
});
```

## Conversation History

```tsx
const { control } = useChatKit({
  api: { /* ... */ },
  history: {
    enabled: true,
    showDelete: true,
    showRename: true,
  },
});
```

## Embedding as Widget

For embedding the chatbot as a floating widget:

```tsx
"use client";

import { useState } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";

export function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  const { control } = useChatKit({
    api: {
      url: "/api/chat",
      domainKey: process.env.NEXT_PUBLIC_OPENAI_DOMAIN_KEY,
    },
  });

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-blue-600 p-4 text-white shadow-lg hover:bg-blue-700"
      >
        {isOpen ? "✕" : "💬"}
      </button>

      {/* Chat Widget */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-50 h-[500px] w-[380px] overflow-hidden rounded-lg shadow-xl">
          <ChatKit control={control} className="h-full w-full" />
        </div>
      )}
    </>
  );
}
```

## Full Page Chat

```tsx
"use client";

import { ChatKit, useChatKit } from "@openai/chatkit-react";

export default function ChatPage() {
  const { control } = useChatKit({
    api: {
      url: "/api/chat",
      domainKey: process.env.NEXT_PUBLIC_OPENAI_DOMAIN_KEY,
    },
    theme: {
      colorScheme: "light",
    },
    startScreen: {
      greeting: "Welcome! How can I help you today?",
    },
  });

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b p-4">
        <h1 className="text-xl font-bold">Todo Chatbot</h1>
      </header>
      <main className="flex-1">
        <ChatKit control={control} className="h-full w-full" />
      </main>
    </div>
  );
}
```

## OpenAI Domain Allowlist Setup

For production deployment:

1. **Deploy frontend** to get production URL
2. **Add domain to OpenAI allowlist**:
   - Go to: https://platform.openai.com/settings/organization/security/domain-allowlist
   - Click "Add domain"
   - Enter your frontend URL (without trailing slash)
3. **Get domain key** and add to env variables

**Note**: `localhost` typically works without domain allowlist configuration.

## Error Handling

```tsx
const { control, error, isLoading } = useChatKit({
  api: { /* ... */ },
});

if (error) {
  return <div>Error: {error.message}</div>;
}

if (isLoading) {
  return <div>Loading...</div>;
}
```

## Best Practices

1. **Use "use client"** - ChatKit requires client-side rendering
2. **Configure CORS** - Ensure backend allows frontend origin
3. **Inject auth tokens** - Use custom fetch for authenticated requests
4. **Handle errors** - Show user-friendly error states
5. **Customize theming** - Match your app''s design system
6. **Use start screen prompts** - Guide users on what they can do
7. **Enable history** - Allow users to continue conversations
' WHERE slug = 'neversight-chatkit-js';