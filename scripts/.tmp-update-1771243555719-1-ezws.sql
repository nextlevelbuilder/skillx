UPDATE skills SET content = '---
name: frontend-audit
description: "Use when auditing frontend code — component architecture, state management, accessibility, design system consistency, bundle size, and rendering performance. Framework-agnostic with specific guidance for React, Vue, Svelte, and vanilla JS."
---

# Frontend Audit

## Overview

Frontend code is the user''s direct experience. Architecture problems here manifest as bugs users can see and feel. A broken backend returns an error; a broken frontend returns confusion, frustration, and churn.

**Core principle:** The UI is the product. If the frontend is broken, nothing else matters to users.

## The Iron Law

```
NO COMPONENT WITHOUT CLEAR RESPONSIBILITY. NO USER INPUT WITHOUT VALIDATION. NO ASYNC OPERATION WITHOUT ALL THREE STATES (LOADING, ERROR, EMPTY).
```

## When to Use

- Auditing frontend architecture
- Reviewing component design
- Investigating UI bugs or inconsistencies
- Before major frontend refactoring
- Performance-related UI complaints
- During any codebase audit
- After onboarding a new frontend framework

## When NOT to Use

- Pure backend API projects with no frontend
- CLI tools (use `architecture-audit` instead)
- Static marketing sites with no interactivity (a quick review of HTML semantics suffices)
- If only a single isolated component needs review (use `code-review` instead)

## Anti-Shortcut Rules

```
YOU CANNOT:
- Say "components look fine" — open each component file and check its line count, prop count, and responsibilities
- Say "state management is handled" — trace where each piece of state lives and why
- Say "design system is consistent" — grep for hardcoded values, check token adoption
- Judge accessibility by looking at code alone — test keyboard navigation manually
- Skip the bundle analysis — measure actual sizes, not guesses
- Trust component names — read the render method to understand true responsibility
- Say "similar to above" — each component gets its own row in the audit table
```

## Common Rationalizations (Don''t Accept These)

| Rationalization | Reality |
|----------------|---------|
| "It works, so it''s fine" | Working ≠ maintainable. 600-line components work but are unmaintainable. |
| "We''ll refactor later" | Later never comes. Component debt compounds faster than financial debt. |
| "Only one person works on the frontend" | That person will leave. Or get sick. Or forget how it works in 6 months. |
| "It''s just a simple form" | Forms are the most complex UI pattern — validation, error states, accessibility, submission states. |
| "We don''t need loading states yet" | Users experience blank screens as crashes. Loading states are not optional. |
| "Design tokens are overkill for this project" | Hardcoded values diverge within weeks. Tokens prevent visual entropy. |
| "Screen readers aren''t our target audience" | 15% of users have disabilities. It''s also a legal requirement in many jurisdictions. |

## Iron Questions (Ask Before Every Component Review)

```
1. If I gave this component to a new developer, could they understand its purpose in 30 seconds?
2. Can I describe what this component does in ONE sentence without using "and"?
3. If I delete this component, what exactly breaks and nothing else?
4. Does every prop this component receives actually change what it renders?
5. Could a user complete the primary action using ONLY a keyboard?
6. What does the user see during the 0-3 seconds between clicking and data loading?
7. What does the user see when there is NO data?
8. What does the user see when the API returns an error?
9. Is every pixel value traceable to a design token?
10. If the API is 10x slower than expected, does this component still behave reasonably?
```

## The Audit Process

### Phase 1: Component Architecture

```
1. MAP the component tree — what renders what (use the framework''s devtools or trace imports)
2. IDENTIFY reusable vs one-off components — reusable should be in a shared directory
3. CHECK component responsibility — one component, one job (SRP)
4. FIND components > 200 lines — candidates for splitting
5. LOOK for prop drilling — data passing through 3+ layers without being used
6. CHECK for business logic in render — calculations, filtering, and formatting should be hooks/utils
7. VERIFY component naming — names should describe WHAT, not HOW
```

**Component quality checklist:**

| Check | Healthy | Warning | Unhealthy |
|-------|---------|---------|-----------|
| Lines of code | < 150 | 150-300 | > 300 |
| Props count | < 5 | 5-8 | > 10 |
| Responsibilities | 1 clear purpose | 1 primary + 1 minor | "It handles display, validation, and API calls" |
| State variables | 0-2 | 3-5 | > 5 (split component) |
| useEffect/watchers | 0-1 | 2-3 | > 3 (data fetching layer needed) |
| Children | Composition-based | Some inline renders | Giant render method with 10+ conditionals |
| Re-render triggers | Only when props change | Some unnecessary re-renders | Re-renders on every keystroke |

**Detection patterns:**

```bash
# Find oversized components (> 300 lines)
find . -name "*.tsx" -o -name "*.vue" -o -name "*.svelte" | xargs wc -l | sort -rn | head -20

# Find high prop count components
grep -c "interface.*Props" --include="*.tsx" -r . | grep -v node_modules | sort -t: -k2 -rn | head -20

# Find prop drilling (components passing through props they don''t use)
grep -rn "\.\.\.props" --include="*.tsx" . | grep -v node_modules | head -20

# Find business logic in components (API calls in render files)
grep -rn "fetch\|axios\|\.get(\|\.post(" --include="*.tsx" --include="*.vue" . | grep -v node_modules | grep -v "hook\|service\|api\|util" | head -20
```

### Phase 2: State Management

```
1. WHERE does state live? (local, global store, URL, server state)
2. IS the right kind of state in the right place?
3. ARE there state synchronization issues? (same data in two places getting out of sync)
4. IS derived state being stored instead of computed?
5. ARE effects (useEffect / watchers) cleaning up properly?
6. IS server state managed with a dedicated tool? (React Query, SWR, TanStack Query)
7. ARE there unnecessary re-renders caused by state updates?
```

**State placement guide:**

| State Type | Correct Location | Wrong Location | Why |
|-----------|-----------------|---------------|-----|
| Form input values | Local component state | Global store | Forms are ephemeral; global state persists unnecessarily |
| Current user session | Global store / context | Local state | Session survives navigation |
| URL-derived state | URL params / searchParams | Component state | Must survive refresh and be shareable |
| Server data | Server state (React Query, SWR) | Local useState | Server data needs caching, refetching, invalidation |
| UI toggles (modals, dropdowns) | Local state | Global store | UI state is component-scoped |
| Theme / preferences | Context / global store | Prop drilling | Cross-cutting concern needs global access |
| Derived/computed values | useMemo / computed | Separate useState | Stored derived state gets out of sync |

**Framework-specific state smells:**

| Framework | Smell | Fix |
|-----------|-------|-----|
| React | useState + useEffect to sync server data | Use React Query / SWR |
| React | Multiple useState that change together | useReducer or single state object |
| Vue | Deeply nested reactive objects | Flatten state or use computed |
| Svelte | Store for component-local state | Use local reactive declarations |
| All | Prop drilling through 4+ components | Context / provide-inject / store |

### Phase 3: Design System Consistency

```
1. IS there a design system? (tokens, variables, shared components)
2. ARE components using shared tokens or ad-hoc values?
3. IS spacing consistent? (one spacing scale or random pixel values)
4. IS typography consistent? (defined font sizes or ad-hoc rem/px)
5. ARE colors from a palette or hardcoded hex values?
6. ARE breakpoints defined and consistent?
7. IS the component library documented?
```

**Common violations:**

| Violation | Detection | Fix |
|-----------|-----------|-----|
| Hardcoded colors | `grep -rn "#[0-9a-f]\{3,6\}" --include="*.css" --include="*.tsx"` | Use `var(--color-primary)` or theme tokens |
| Hardcoded spacing | `grep -rn "margin.*[0-9]px\|padding.*[0-9]px" --include="*.css"` | Use spacing scale tokens (4, 8, 12, 16, 24, 32, 48) |
| Inline styles for layout | `grep -rn "style={{" --include="*.tsx"` | Use CSS classes or styled-components |
| Inconsistent breakpoints | `grep -rn "max-width.*px\|min-width.*px" --include="*.css"` | Define breakpoint tokens |
| Magic z-index values | `grep -rn "z-index.*[0-9]" --include="*.css" --include="*.tsx"` | Define z-index scale (1, 10, 100, 1000) |
| Unsystematic font sizes | `grep -rn "font-size" --include="*.css"` | Define type scale (xs, sm, md, lg, xl) |
| Mixed unit systems | Both px and rem throughout | Standardize on rem with px fallbacks |

### Phase 4: Error, Loading, and Empty States

```
1. DOES every async operation have a loading state?
2. DOES every async operation have an error state with retry?
3. ARE empty states handled? (no data, no results, first use)
4. DO forms show validation errors clearly and next to the input?
5. DO failed submissions preserve user input?
6. IS there a global error boundary?
7. DO timeout/offline states have dedicated UI?
```

**State coverage matrix (complete for EVERY component with async operations):**

| Component | Loading | Error | Empty | Success | Partial | Timeout | Offline |
|-----------|---------|-------|-------|---------|---------|---------|---------|
| UserList | ✅ Skeleton | ✅ Retry | ❌ Missing | ✅ | N/A | ❌ | ❌ |
| Dashboard | ⚠️ Spinner | ❌ Generic | ❌ | ✅ | ❌ | ❌ | ❌ |

**Quality standards per state:**

| State | Minimum Acceptable | Gold Standard |
|-------|-------------------|---------------|
| Loading | Spinner or skeleton | Content-shaped skeleton with shimmer animation |
| Error | Error message | Error message + retry button + help link |
| Empty | "No items" text | Illustration + explanation + call-to-action |
| Success | Data displayed | Smooth transition with optional celebration |
| Timeout | Generic error | "Taking longer than expected" with retry |
| Offline | Nothing | Offline indicator with cached data if available |

### Phase 5: Accessibility (Quick Check)

```
1. DO images have descriptive alt text (not "image" or "photo")?
2. ARE interactive elements focusable and keyboard-accessible?
3. IS there visible focus style (not just browser default outline: none)?
4. DO form inputs have associated <label> elements?
5. ARE color contrast ratios sufficient (4.5:1 text, 3:1 components)?
6. DO modals trap focus correctly?
7. CAN the entire primary flow be completed with keyboard only?
8. IS there a skip navigation link?
```

(For deep accessibility audit, use `accessibility-audit` skill)

### Phase 6: Bundle and Performance

```
1. WHAT is the total bundle size? (target: < 200KB initial, < 500KB total)
2. ARE there unnecessary dependencies? (moment.js, lodash full import, full icon packs)
3. IS code splitting used for routes?
4. ARE images optimized (WebP, responsive sizes, lazy loading)?
5. ARE heavy components lazily loaded?
6. IS tree shaking working? (no importing entire libraries for one function)
7. ARE fonts optimized (subset, preload, font-display: swap)?
8. ARE third-party scripts deferred?
```

**Common bundle bloat sources:**

| Dependency | Typical Size | Lighter Alternative | Savings |
|-----------|-------------|-------------------|---------|
| moment.js | 284KB | dayjs (2KB) or date-fns (tree-shakeable) | ~280KB |
| lodash (full) | 72KB | lodash-es (tree-shakeable) or native | ~60KB |
| Material UI (full) | 400KB+ | Import individual components | ~300KB |
| Font Awesome (all) | 1.5MB | Only import used icons | ~1.4MB |
| Axios | 13KB | Native fetch | 13KB |

**Detection:**

```bash
# Check bundle size (if available)
npx bundle-phobia [package-name]

# Find full library imports
grep -rn "import .* from ''lodash''" --include="*.ts" --include="*.tsx" . | grep -v node_modules
grep -rn "import .* from ''@mui/material''" --include="*.ts" --include="*.tsx" . | grep -v node_modules

# Find unoptimized images
find . -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" | xargs ls -la | sort -k5 -rn | head -10
```

### Phase 7: Rendering Performance

```
1. ARE lists virtualized for > 100 items? (react-window, vue-virtual-scroller)
2. ARE expensive computations memoized? (useMemo, computed)
3. ARE component re-renders minimized? (React.memo, shouldComponentUpdate)
4. ARE event handlers debounced for high-frequency inputs? (search, resize, scroll)
5. IS there unnecessary DOM manipulation?
6. ARE animations using GPU-accelerated properties? (transform, opacity — not top, left, width)
```

## Output Format

```markdown
# Frontend Audit: [Project Name]

## Overview
- **Framework:** [React/Vue/Svelte/Vanilla]
- **Components:** N total, N reusable, N one-off, N oversized (>300 LOC)
- **Bundle Size:** XKB initial / XKB total
- **Design System:** Comprehensive / Partial / Missing
- **State Management:** [Library/approach]
- **Accessibility:** WCAG AA Compliant / Partial / Non-compliant

## Component Health
| Component | Lines | Props | State Vars | Responsibilities | States Covered | Assessment |
|-----------|-------|-------|------------|------------------|----------------|------------|
| UserDashboard | 450 | 12 | 8 | Display, fetch, filter | Loading only | 🔴 Split needed |
| LoginForm | 85 | 3 | 2 | Auth form | All 4 | 🟢 Healthy |

## State Management Assessment
| State Type | Location | Assessment |
|-----------|----------|------------|
| Server data | React Query | 🟢 Correct |
| Form state | Local useState | 🟢 Correct |
| User session | Redux store | 🟢 Correct |
| Derived values | Separate useState | 🔴 Should be useMemo |

## Design System Compliance
| Check | Violations | Assessment |
|-------|-----------|------------|
| Hardcoded colors | 23 instances | 🟠 High |
| Hardcoded spacing | 45 instances | 🔴 Critical |
| Inline styles | 12 instances | 🟡 Medium |

## Bundle Analysis
| Chunk | Size | Assessment |
|-------|------|------------|
| Main | 180KB | 🟢 Under 200KB |
| Vendor | 350KB | 🟡 Could tree-shake |

## Findings
[Standard severity format — sorted by severity]

## Summary
| Severity | Count |
|----------|-------|
| 🔴 Critical | N |
| 🟠 High | N |
| 🟡 Medium | N |
| 🟢 Low | N |

## Verdict: [PASS / CONDITIONAL PASS / FAIL]
```

## Red Flags — STOP and Investigate

- Components > 500 lines (god components)
- Prop drilling through 4+ levels
- Business logic in UI components (API calls, calculations in render)
- No loading/error/empty states on async components
- Hardcoded strings (no i18n preparation)
- No design tokens (all ad-hoc values)
- Direct DOM manipulation in framework components
- `any` types in TypeScript component props
- Console.log statements in production code
- Inline styles for layout that should be CSS
- No error boundar

<!-- truncated -->' WHERE slug = 'boparaiamrit-frontend-audit';
UPDATE skills SET content = '---
name: design-review
description: Evaluate a React component against the Design System and propose UX/UI improvements based on Figma best practices. Use when reviewing components for design compliance, checking UI consistency, or improving user experience.
allowed-tools: Read, Glob, Grep, Edit
---

# Design System Review

Evaluate React components against the Bilavnova Design System (`src/Design System.md`) and propose UX/UI improvements.

## Instructions

### Step 1: Read the Files

1. Read the target component file provided by the user
2. Read `src/Design System.md` for reference standards

### Step 2: Analyze for Violations

Check the component against these compliance categories:

#### Typography
- **VIOLATION:** `text-[10px]` or smaller (minimum is `text-xs`/12px)
- **VIOLATION:** Missing dark mode text pairs (e.g., `text-slate-900` without `dark:text-white`)
- **CHECK:** Heading hierarchy follows `text-2xl` > `text-xl` > `text-lg` > `text-sm`

#### Colors
- **VIOLATION:** Arbitrary colors when Design System colors exist (use `lavpop-blue`, `lavpop-green`, slate scale)
- **VIOLATION:** Missing dark mode pairs for `bg-*`, `border-*`, `text-*` classes
- **CHECK:** Semantic colors used correctly (emerald=success, red=error, amber=warning)

#### Spacing & Layout
- **VIOLATION:** Arbitrary z-index like `z-[1050]` (use semantic: `z-40`, `z-50`, `z-[60]`, `z-[70]`)
- **CHECK:** Consistent spacing scale (gap-1 through gap-8, p-1 through p-8)
- **CHECK:** Responsive breakpoints applied (xs:, sm:, md:, lg:, xl:)

#### Mobile & Touch
- **VIOLATION:** Touch targets under 44px (buttons, links, interactive elements need `min-h-[44px] min-w-[44px]`)
- **VIOLATION:** Hover-only interactions without tap fallback
- **CHECK:** Fixed bottom elements have `pb-24 lg:pb-6` clearance for bottom nav
- **CHECK:** Safe area classes used for notched devices (`safe-area-top`, `bottom-nav-safe`)

#### Component Patterns
- **CHECK:** Buttons follow Design System patterns (primary: gradient, secondary: slate bg, icon: p-2.5)
- **CHECK:** Cards use standard styling (`bg-white dark:bg-slate-800 rounded-xl border`)
- **CHECK:** KPI displays use correct component: `HeroKPICard`, `SecondaryKPICard`, or `KPICardGrid`
- **CHECK:** Modals implement: escape key close, click-outside close, body scroll lock, portal rendering

#### Accessibility
- **VIOLATION:** Interactive elements without `aria-label` or visible text
- **VIOLATION:** Missing focus states (`focus:ring-2 focus:ring-lavpop-blue`)
- **CHECK:** Proper heading structure (h1 > h2 > h3)
- **CHECK:** Color contrast meets WCAG AA (4.5:1 for text)

#### Animations
- **CHECK:** Standard transitions used (`transition-all duration-200`)
- **CHECK:** Button active states present (`active:scale-95` or `active:scale-[0.98]`)

### Step 3: Propose Design Enhancements

Beyond violations, suggest improvements based on Figma/UI best practices:

#### Visual Hierarchy
- Primary actions should be visually dominant (larger, bolder, colored)
- Secondary actions should be subdued (outline or ghost buttons)
- Suggest `font-bold`, `shadow-lg`, or size increases for CTAs

#### Whitespace & Breathing Room
- Cramped layouts need more padding (`p-4` → `p-6`)
- Add spacing between sections (`space-y-4`, `space-y-6`)
- Cards should have generous internal padding

#### Consistency
- Flag inconsistent border-radius within same component
- Flag inconsistent padding/margin patterns
- Suggest alignment improvements

#### Micro-interactions
- Suggest hover states for interactive cards (`hover:shadow-lg`, `hover:-translate-y-1`)
- Suggest transition effects where missing
- Recommend loading/skeleton states for async content

#### Component Composition
- Large JSX blocks (>100 lines) should be split into sub-components
- Repeated patterns should use shared components
- Complex conditionals should be extracted

#### Icon & Border Refinement
- Icons should be 16px, 20px, or 24px (standard sizes)
- Suggest soft shadows (`shadow-soft`) over harsh ones
- Recommend subtle borders for depth

### Step 4: Output Format

Present findings in this format:

```
## Design Review: [ComponentName].jsx

### Violations Found (N)

1. **[Category]** (line X): [Description]
   Fix: `[code change]`

2. **[Category]** (line Y): [Description]
   Fix: `[code change]`

### Design Enhancements (N)

1. **[Category]** (line X-Y): [Description]
   Suggestion: `[code change]`

---
Apply violations fixes? [Yes/No]
Apply enhancements? [Yes/No]
```

### Step 5: Apply Changes

If user approves:
1. Apply violation fixes first (these are required for compliance)
2. Apply enhancements if user accepts them (these are optional improvements)
3. Use the Edit tool to make changes
4. Summarize changes made

## Quick Reference

### Must-Have Dark Mode Pairs
| Light | Dark |
|-------|------|
| `bg-white` | `dark:bg-slate-800` or `dark:bg-slate-900` |
| `bg-slate-50` | `dark:bg-slate-800` |
| `bg-slate-100` | `dark:bg-slate-800` |
| `text-slate-900` | `dark:text-white` |
| `text-slate-700` | `dark:text-slate-300` |
| `text-slate-600` | `dark:text-slate-400` |
| `border-slate-200` | `dark:border-slate-700` |

### Standard Button Patterns
```jsx
// Primary
className="bg-gradient-to-r from-lavpop-blue to-blue-600 text-white font-bold rounded-xl px-6 py-3.5 shadow-lg active:scale-[0.98] transition-all"

// Secondary
className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl px-4 py-2 transition-all"

// Icon
className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95"
```

### Touch Target Minimum
```jsx
className="min-h-[44px] min-w-[44px]"
// or use utility class
className="touch-target"
```

### Z-Index Scale
| Use Case | Value |
|----------|-------|
| Sidebar/Dropdown | `z-40` |
| Primary Modal | `z-50` |
| Child Modal | `z-[60]` |
| Alert | `z-[70]` |
| Toast | `z-[80]` |
' WHERE slug = 'lucaslopezpuerta-design-review';
UPDATE skills SET content = '---
name: mobile-developer
description: Develop React Native or Flutter apps with native integrations. Handles offline sync, push notifications, and app store deployments. Use PROACTIVELY for mobile features, cross-platform code, or app optimization.
license: Apache-2.0
metadata:
  author: edescobar
  version: "1.0"
  model-preference: sonnet
---

# Mobile Developer

You are a mobile developer specializing in cross-platform app development.

## Focus Areas
- React Native/Flutter component architecture
- Native module integration (iOS/Android)
- Offline-first data synchronization
- Push notifications and deep linking
- App performance and bundle optimization
- App store submission requirements

## Approach
1. Platform-aware but code-sharing first
2. Responsive design for all screen sizes
3. Battery and network efficiency
4. Native feel with platform conventions
5. Thorough device testing

## Output
- Cross-platform components with platform-specific code
- Navigation structure and state management
- Offline sync implementation
- Push notification setup for both platforms
- Performance optimization techniques
- Build configuration for release

Include platform-specific considerations. Test on both iOS and Android.
' WHERE slug = 'sidetoolco-mobile-developer';
UPDATE skills SET content = '---
name: i18n-translation
description: >
  Complete internationalization implementation for web applications.
  Provides systematic AI-driven workflow to achieve 100% i18n coverage with
  zero hardcoded strings in SOURCE CODE. Use for adding i18n to new projects,
  migrating hardcoded strings to i18n, adding new language support, or auditing
  i18n coverage. CRITICAL: This skill focuses ONLY on source code internationalization
  (components, views, UI), NOT documentation files (README.md, docs/).
  When checking for existing i18n, prioritize src/ directory detection and ignore
  docs/, README*, and markdown files. Includes extraction patterns, component
  migration strategies, namespace organization, and validation checklists.
  Works with React, Vue, Angular, and similar frameworks.
---

# i18n-translation: Full Internationalization Implementation

Implement complete internationalization (i18n) for web applications with 100% coverage. This skill provides a systematic, AI-driven workflow to eliminate all hardcoded strings and establish a scalable translation system.

## Quick Start

For immediate i18n implementation:

1. **Read the complete workflow:** See [workflow.md](references/workflow.md) for the 5-phase process
2. **Plan file structure:** See [modular-files.md](references/modular-files.md) for splitting strategy
3. **Extract strings systematically:** Process every component, extract ALL user-facing text
4. **Set up infrastructure:** Install i18next, create modular translation files
5. **Migrate components:** Replace hardcoded strings with `t()` calls
6. **Validate thoroughly:** Ensure zero hardcoded strings remain

**⚠️ Important:** For projects with > 1000 strings, you MUST split translation files by namespace. See [modular-files.md](references/modular-files.md) for complete guidance.

**Expected outcome:** 100% of UI text uses i18n system, application works flawlessly in all supported languages.

---

## ⚠️ Critical: Code vs Documentation Internationalization

**This skill ONLY handles source code internationalization.**

### What This Skill Does (Source Code i18n)

✅ **IN SCOPE - Components and Source Code:**
- UI components in `src/`, `app/`, `components/`, `views/`, `pages/`
- React/Vue/Angular/Svelte components (.tsx, .jsx, .vue, .ts, .js)
- User-facing text in application code
- Translation files for the application (en.json, zh.json, etc.)
- i18n library setup (i18next, vue-i18n, etc.)

### What This Skill Does NOT Handle (Documentation i18n)

❌ **OUT OF SCOPE - Documentation Files:**
- README.md, README.zh-CN.md, README.en.md
- Documentation in `docs/` folder
- Markdown files (.md)
- Documentation-specific translation systems
- Multi-language documentation sites

### Priority Rule

**When detecting existing i18n implementation:**

1. **FIRST PRIORITY:** Check source code directories (`src/`, `app/`, `components/`, `views/`)
   - Look for i18n library imports in component files
   - Check for `useTranslation()`, `t()` function calls
   - Look for translation files in source directories

2. **SECOND PRIORITY:** Ignore documentation files
   - `README*.md` files do NOT count as i18n implementation
   - `docs/` folder should be completely ignored
   - Multi-language documentation ≠ application i18n

### Detection Commands

**✅ CORRECT - Check source code only:**
```bash
# Check for i18n in source code
Grep: "i18n|useTranslation|i18next" in src/ directory
Glob: "src/**/locales/**/*.json"
Glob: "src/**/i18n/**"

# Check component files
Grep: "from [\"'']react-i18next[\"'']|from [\"'']vue-i18n[\"'']" in src/
```

**❌ WRONG - Don''t check documentation:**
```bash
# These will detect documentation i18n, which is wrong
Glob: "**/README*.md"
Glob: "docs/**"
Grep: "i18n" in all files (includes docs)
```

### Common Misconceptions

**Myth:** "My project has README.md and README.zh-CN.md, so it has i18n."
**Fact:** No, documentation internationalization is separate from code i18n.

**Myth:** "I have i18n in my docs/ folder, so I can skip i18n setup."
**Fact:** Documentation i18n doesn''t help your UI components translate.

**Myth:** "Finding i18n references anywhere means the project is internationalized."
**Fact:** Only source code i18n counts. Documentation must be ignored.

---

## When to Use This Skill

Use this skill when:

- Adding i18n to a new project
- Migrating existing hardcoded strings to i18n
- Adding support for additional languages
- Auditing or improving existing i18n implementation
- Ensuring complete i18n coverage

**Key principle:** 100% coverage is the only acceptable standard. Zero hardcoded strings in UI.

---

## Core Methodology

### The 5-Phase Workflow

**Phase 1: Project Analysis** (5-10 min)
- Identify framework, build tool, and component structure
- Check for existing i18n setup
- Create component inventory
- Design namespace structure

**Phase 2: String Extraction** (30-60 min)
- Systematically read each component
- Extract ALL user-facing strings (text, placeholders, labels, messages, etc.)
- Organize by namespace and component
- Create master translation list

**Phase 3: Translation Infrastructure** (15-20 min)
- Install i18next (or framework-appropriate library)
- Create i18n configuration
- Create complete translation files for all languages
- Add type definitions (if TypeScript)

**Phase 4: Component Migration** (40-80 min)
- Update each component to use `useTranslation` hook
- Replace ALL hardcoded strings with `t()` calls
- Handle interpolation, plurals, and complex patterns
- Ensure zero hardcoded strings remain

**Phase 5: Validation** (10-15 min)
- Verify no hardcoded strings remain (search patterns)
- Validate translation file syntax and consistency
- Test language switching
- Verify translation quality
- Complete all checklist items

**Total time:** 1.5-3 hours for typical app (50-100 components)

### Success Criteria

✅ 100% of user-facing text uses i18n
✅ Zero hardcoded strings in UI components
✅ Translation files complete for all languages
✅ Application works perfectly in all supported languages
✅ No console errors or warnings

---

## Implementation Guide

### Step 1: Understand the Project

Before touching any code:

1. **Identify the framework:**
   - React → use `i18next` + `react-i18next`
   - Vue → use `vue-i18n`
   - Angular → use `@ngx-translate/core`
   - Other → check framework documentation

2. **Analyze component structure:**
   ```bash
   Glob: "src/components/**/*.{tsx,jsx,vue}"
   Glob: "src/views/**/*.{tsx,jsx,vue}"
   ```

3. **Check existing i18n in SOURCE CODE only:**
   ```bash
   # ✅ CORRECT - Check source code directories only
   Grep: "i18n|i18next|vue-i18n|useTranslation" in src/
   Glob: "src/**/locales/**"
   Glob: "src/**/i18n/**"

   # ❌ WRONG - Don''t check documentation
   # Do NOT search in: docs/, README*.md, .md files
   ```

   **CRITICAL:** Only check source code directories. Ignore documentation files completely.

4. **Create component inventory:**
   - List all components by category (layout, features, common, utility)
   - Note components with heavy UI text
   - Identify migration priority

### Step 2: Extract All Strings

For **each component**, without exception:

1. Read the component file
2. Extract **every** user-facing string:
   - Text content: `<div>Hello World</div>`
   - Labels: `<label>Email</label>`
   - Placeholders: `<input placeholder="Enter email" />`
   - Button text: `<button>Submit</button>`
   - Headings: `<h1>Dashboard</h1>`
   - Messages: `<p>Error occurred</p>`
   - Attributes: `title`, `aria-label`, `alt`
   - Options: `<option>English</option>`

3. Determine appropriate namespace
4. Create translation key using naming conventions
5. Add to master translation list

**Pattern to follow:**

```
For component: src/components/chat/ChatView.tsx

Extracted strings:
- "Chat" → chat.chatView.title
- "New Conversation" → chat.chatView.newConversation
- "Type a message..." → chat.chatView.inputPlaceholder
- "Send" → chat.chatView.sendButton
```

### Step 3: Set Up i18n Infrastructure

**For React projects:**

1. Install dependencies:
   ```bash
   npm install i18next react-i18next i18next-browser-languagedetector
   ```

2. Create configuration (`src/i18n/config.ts`):
   ```typescript
   import i18n from "i18next"
   import { initReactI18next } from "react-i18next"
   import LanguageDetector from "i18next-browser-languagedetector"

   import enTranslations from "./locales/en.json"
   import zhTranslations from "./locales/zh.json"

   i18n
     .use(LanguageDetector)
     .use(initReactI18next)
     .init({
       resources: {
         en: { translation: enTranslations },
         zh: { translation: zhTranslations },
       },
       fallbackLng: "en",
       lng: "en",
       interpolation: { escapeValue: false },
     })

   export default i18n
   ```

3. Create translation files:
   - `src/i18n/locales/en.json` - Copy all extracted strings here
   - `src/i18n/locales/zh.json` - Translate all values to Chinese

4. Initialize in main entry point:
   ```typescript
   import "./i18n/config" // Must be first import
   ```

### Step 4: Migrate All Components

For **each component**:

1. Add `useTranslation` hook:
   ```typescript
   import { useTranslation } from "react-i18next"

   export const MyComponent: React.FC = () => {
     const { t } = useTranslation("namespace")
   ```

2. Replace **every** hardcoded string:
   ```tsx
   // Before
   <h1>Settings</h1>
   <button>Save</button>
   <input placeholder="Enter email" />

   // After
   <h1>{t("title")}</h1>
   <button>{t("save")}</button>
   <input placeholder={t("emailPlaceholder")} />
   ```

3. Handle special cases:
   - Interpolation: `t("greeting", { name: userName })`
   - Conditionals: `t(isLoading ? "loading" : "complete")`
   - Multiple namespaces: `const { t: tCommon } = useTranslation("common")`

4. Verify component still works

**Pattern examples:** See [patterns.md](references/patterns.md) for 20+ detailed examples.

### Step 5: Validate Thoroughly

**Complete these checks:**

1. **Search for remaining hardcoded strings:**
   ```bash
   Grep: all components for text patterns
   Expected: Zero user-facing hardcoded strings
   ```

2. **Validate translation files:**
   - Verify JSON syntax
   - Ensure key consistency between languages
   - Check no missing translations
   - Verify no placeholder text

3. **Test language switching:**
   - Load app in English
   - Switch to Chinese
   - Verify ALL text changes
   - Check console for errors

4. **Review translation quality**
5. **Complete checklist:** See [checklist.md](references/checklist.md)

---

## Reference Documentation

### Comprehensive Guides

**[workflow.md](references/workflow.md)** - Complete 5-phase workflow
- Detailed process for each phase
- Execution strategies
- Quality standards
- Time estimates
- Common pitfalls

**[patterns.md](references/patterns.md)** - Translation patterns and examples
- 20+ real-world examples
- Before/after code comparisons
- Common patterns (interpolation, plurals, etc.)
- Component-specific patterns
- Mistakes to avoid

**[namespaces.md](references/namespaces.md)** - Namespace organization
- Namespace principles and best practices
- Recommended structure
- Naming conventions
- Category guidelines
- Anti-patterns to avoid

**[checklist.md](references/checklist.md)** - Complete validation checklists
- Phase-specific checklists
- Quality criteria
- Acceptance criteria
- Common issues to check

---

## Key Principles

### 1. Completeness is Non-Negotiable

**100% coverage means:**
- Every user-facing string uses i18n
- No "small strings" overlooked
- No "we''ll do this later" exceptions
- Zero tolerance for hardcoded text

### 2. Systematic Processing

**Process components methodically:**
- One component at a time
- Every string extracted
- Every component migrated
- No skipping ahead

### 3. Organize by Namespace

**Use logical namespaces:**
- `common` - Shared UI elements
- `{feature}` - Feature-specific strings
- `settings` - Settings/configuration
- `errors` - Error messages
- etc.

See [namespaces.md](references/namespaces.md) for complete guide.

### 4. Quality Over Speed

**Don''t rush:**
- Each phase must be complete before moving to next
- Use checklists to verify
- Validate thoroughly
- Fix issues immediately

### 5. Test Everything

**Verification is critical:**
- Test language switching
- Check for console errors
- Verify translation quality
- Test all user flows

---

## Common Patterns

### Basic Text

```tsx
// Before
<h1>Welcome</h1>

// After
<h1>{t("welcome")}</h1>
```

### Interpolation

```tsx
// Before
<p>Hello, {userName}!</p>

// After
<p>{t("greeting", { userName })}</p>

// Translation file
"greeting": "Hello, {{userName}}!"
```

### Attributes

```tsx
// Before
<input placeholder="Enter email" />
<button title="Click to submit">Submit</button>

// After
<input placeholder={t("emailPlaceholder")} />
<button title={t("submitTitle")}>{t("submit")}</button>
```

### Multiple Namespaces

```tsx
const { t: tCommon } = useTranslation("common")
const { t: tSettings } = useTranslation("settings")

<button>{tCommon("save")}</button>
<h1>{tSettings("title")}</h1>
```

See [patterns.md](references/patterns.md) for 20+ more examples.

---

## Troubleshooting

### Issue: Missing Translation Keys

**Symptom:** Console warnings about missing keys

**Solution:**
- Verify key exists in translation file
- Check namespace matches
- Verify key name spelling
- Check JSON syntax

### Issue: Text Not Switching

**Symptom:** Language changed but text didn''t update

**Solution:**
- Verify i18n.changeLanguage() is called
- Check component uses useTranslation hook
- Ensure component re-renders on language change
- Verify language code is correct

### Issue: Hardcoded Strings Remaining

**Symptom:** Some text doesn''t translate

**Solution:**
- Search for remaining hardcoded strings
- Check if string is user-facing
- Verify component was migrated
- Check for dynamically generated strings

### Issue: Layout Broken with Translations

**Symptom:** UI looks wrong after translation

**Solution:**
- Some languages have longer text (German, Finnish)
- Use flexible layouts
- Test with longer strings
- Consider CSS `word-break` or text truncation

---

## Quality Standards

### Completeness

- [ ] All components processed
- [ ] All strings extracted
- [ ] All strings translated
- [ ] Zero hardcoded strings remain

### Correctness

- [ ] Valid JSON in translation files
- [ ] All keys match between languages
- [ ] No missing translations
- [ ] No TypeScript errors (if applicable)

### Functionality

- [ ] App works in all languages
- [ ] Language switching works
- [ ] No console errors
- [ ] All features work

### Quality

- [ ] Translations are natural and accurate
- [ ] Consistent terminology
- [ ] Appropriate tone
- [ ] Culturally suitable

---

## Quick Reference

### Essential Commands

```bash
# Install dependencies (React)
npm install i18next react-i18next i18next-browser-language

<!-- truncated -->' WHERE slug = 'hybridtalentcomputing-i18n-translation';
UPDATE skills SET content = '---
name: vue-fundamentals
description: Master Vue.js core concepts - Components, Reactivity, Templates, Directives, Lifecycle
sasmp_version: "1.3.0"
bonded_agent: 01-vue-fundamentals
bond_type: PRIMARY_BOND
version: "2.0.0"
last_updated: "2025-01"
---

# Vue Fundamentals Skill

Production-grade skill for mastering Vue.js core concepts and building robust component-based applications.

## Purpose

**Single Responsibility:** Teach and validate understanding of Vue.js fundamentals including component architecture, reactivity system, template syntax, directives, and lifecycle hooks.

## Parameter Schema

```typescript
interface VueFundamentalsParams {
  topic: ''components'' | ''reactivity'' | ''templates'' | ''directives'' | ''lifecycle'' | ''all'';
  level: ''beginner'' | ''intermediate'' | ''advanced'';
  context?: {
    current_knowledge?: string[];
    learning_goal?: string;
    time_available?: string;
  };
}
```

## Learning Modules

### Module 1: Components (Foundation)
```
Prerequisites: HTML, CSS, JavaScript basics
Duration: 2-3 hours
Outcome: Build reusable Vue components
```

| Topic | Concept | Exercise |
|-------|---------|----------|
| SFC Structure | `<template>`, `<script>`, `<style>` | Create first component |
| Props | Passing data down | Build Card component |
| Events | `$emit` for child→parent | Button with click handler |
| Slots | Content distribution | Layout component |
| Registration | Local vs global | Component organization |

### Module 2: Reactivity (Core)
```
Prerequisites: Module 1
Duration: 3-4 hours
Outcome: Understand Vue''s reactivity system
```

| Topic | Concept | Exercise |
|-------|---------|----------|
| ref() | Primitive reactivity | Counter app |
| reactive() | Object reactivity | Form state |
| computed() | Derived values | Shopping cart total |
| watch() | Side effects | API calls on change |
| watchEffect() | Auto-track | Logging changes |

### Module 3: Templates (Syntax)
```
Prerequisites: Module 1
Duration: 2 hours
Outcome: Master template syntax
```

| Topic | Concept | Exercise |
|-------|---------|----------|
| Interpolation | `{{ }}` binding | Display data |
| v-bind | Attribute binding | Dynamic classes |
| v-on | Event handling | Form submission |
| v-model | Two-way binding | Input forms |
| v-if/v-show | Conditional render | Toggle visibility |
| v-for | List rendering | Todo list |

### Module 4: Directives (Built-in & Custom)
```
Prerequisites: Module 3
Duration: 2 hours
Outcome: Use and create directives
```

| Topic | Concept | Exercise |
|-------|---------|----------|
| v-if/else | Conditional | Auth display |
| v-for + key | Iteration | Data tables |
| v-model modifiers | .lazy, .trim | Form validation |
| v-on modifiers | .prevent, .stop | Event control |
| Custom directives | Reusable DOM logic | v-focus directive |

### Module 5: Lifecycle (Hooks)
```
Prerequisites: Modules 1-4
Duration: 2 hours
Outcome: Manage component lifecycle
```

| Hook | Use Case | Example |
|------|----------|---------|
| onMounted | DOM ready | Fetch initial data |
| onUpdated | After reactivity | Scroll position |
| onUnmounted | Cleanup | Clear intervals |
| onErrorCaptured | Error boundary | Graceful degradation |

## Validation Checkpoints

### Beginner Checkpoint
- [ ] Create SFC with props and events
- [ ] Use ref() for counter
- [ ] Apply v-if and v-for
- [ ] Handle form with v-model

### Intermediate Checkpoint
- [ ] Build multi-slot component
- [ ] Use computed for derived state
- [ ] Implement watch with cleanup
- [ ] Create custom directive

### Advanced Checkpoint
- [ ] Design component composition patterns
- [ ] Optimize with shallowRef
- [ ] Implement error boundaries
- [ ] Build async components

## Retry Logic

```typescript
const skillConfig = {
  maxAttempts: 3,
  backoffMs: [1000, 2000, 4000],
  onFailure: ''provide_hint''
}
```

## Observability

```yaml
tracking:
  - event: module_started
    data: [module_name, user_level]
  - event: checkpoint_passed
    data: [checkpoint_name, attempts]
  - event: skill_completed
    data: [total_time, score]
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Component not showing | Not registered | Check import/registration |
| Props not reactive | Wrong prop type | Use correct type |
| v-for no key | Missing :key | Add unique key |
| Infinite loop | watch causing watched change | Guard the update |

### Debug Steps

1. Check Vue Devtools component tree
2. Verify props are passed correctly
3. Confirm reactive values have .value
4. Check lifecycle hook placement

## Unit Test Template

```typescript
import { describe, it, expect } from ''vitest''
import { mount } from ''@vue/test-utils''
import MyComponent from ''./MyComponent.vue''

describe(''MyComponent'', () => {
  it(''renders props correctly'', () => {
    const wrapper = mount(MyComponent, {
      props: { title: ''Test'' }
    })
    expect(wrapper.text()).toContain(''Test'')
  })

  it(''emits event on action'', async () => {
    const wrapper = mount(MyComponent)
    await wrapper.find(''button'').trigger(''click'')
    expect(wrapper.emitted(''action'')).toBeTruthy()
  })
})
```

## Usage

```
Skill("vue-fundamentals")
```

## Related Skills

- `vue-composition-api` - Next level after fundamentals
- `vue-typescript` - Adding type safety
- `vue-testing` - Testing fundamentals

## Resources

- [Vue.js Tutorial](https://vuejs.org/tutorial/)
- [Vue Mastery](https://www.vuemastery.com/)
- [Vue School](https://vueschool.io/)
' WHERE slug = 'pluginagentmarketplace-vue-fundamentals';
UPDATE skills SET content = '---
name: ui-ux-pro-max
description: "UI/UX design intelligence. 50 styles, 21 palettes, 50 font pairings, 20 charts, 8 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, mobile app, .html, .tsx, .vue, .svelte. Elements: button, modal, navbar, sidebar, card, table, form, chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, flat design. Topics: color palette, accessibility, animation, layout, typography, font pairing, spacing, hover, shadow, gradient."
---

# UI/UX Pro Max - Design Intelligence

Searchable database of UI styles, color palettes, font pairings, chart types, product recommendations, UX guidelines, and stack-specific best practices.

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

### Step 2: Search Relevant Domains

Use `search.py` multiple times to gather comprehensive information. Search until you have enough context.

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

**Recommended search order:**

1. **Product** - Get style recommendations for product type
2. **Style** - Get detailed style guide (colors, effects, frameworks)
3. **Typography** - Get font pairings with Google Fonts imports
4. **Color** - Get color palette (Primary, Secondary, CTA, Background, Text, Border)
5. **Landing** - Get page structure (if landing page)
6. **Chart** - Get chart recommendations (if dashboard/analytics)
7. **UX** - Get best practices and anti-patterns
8. **Stack** - Get stack-specific guidelines (default: html-tailwind)

### Step 3: Stack Guidelines (Default: html-tailwind)

If user doesn''t specify a stack, **default to `html-tailwind`**.

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack html-tailwind
```

Available stacks: `html-tailwind`, `react`, `nextjs`, `vue`, `svelte`, `swiftui`, `react-native`, `flutter`

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

---

## Example Workflow

**User request:** "Làm landing page cho dịch vụ chăm sóc da chuyên nghiệp"

**AI should:**

```bash
# 1. Search product type
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness service" --domain product

# 2. Search style (based on industry: beauty, elegant)
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "elegant minimal soft" --domain style

# 3. Search typography
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "elegant luxury" --domain typography

# 4. Search color palette
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness" --domain color

# 5. Search landing page structure
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "hero-centric social-proof" --domain landing

# 6. Search UX guidelines
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "animation" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "accessibility" --domain ux

# 7. Search stack guidelines (default: html-tailwind)
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "layout responsive" --stack html-tailwind
```

**Then:** Synthesize all search results and implement the design.

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
- [ ] Responsive at 320px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile

### Accessibility
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Color is not the only indicator
- [ ] `prefers-reduced-motion` respected
' WHERE slug = 'hungtrandigital-ui-ux-pro-max';
UPDATE skills SET content = '---
name: vue-composition-api
description: Master Vue Composition API - Composables, Reactivity Utilities, Script Setup, Provide/Inject
sasmp_version: "1.3.0"
bonded_agent: 02-vue-composition
bond_type: PRIMARY_BOND
version: "2.0.0"
last_updated: "2025-01"
---

# Vue Composition API Skill

Production-grade skill for mastering Vue''s Composition API and building reusable, scalable logic.

## Purpose

**Single Responsibility:** Teach composable design patterns, advanced reactivity utilities, and modern Vue 3 composition techniques.

## Parameter Schema

```typescript
interface CompositionAPIParams {
  topic: ''composables'' | ''reactivity'' | ''script-setup'' | ''provide-inject'' | ''all'';
  level: ''beginner'' | ''intermediate'' | ''advanced'';
  context?: {
    existing_knowledge?: string[];
    use_case?: string;
  };
}
```

## Learning Modules

### Module 1: Script Setup Basics
```
Prerequisites: vue-fundamentals
Duration: 1-2 hours
Outcome: Use <script setup> effectively
```

| Topic | Concept | Exercise |
|-------|---------|----------|
| Syntax | `<script setup>` shorthand | Convert Options API |
| defineProps | Type-safe props | Typed component |
| defineEmits | Type-safe events | Event handling |
| defineExpose | Public API | Component ref access |

### Module 2: Reactivity Deep Dive
```
Prerequisites: Module 1
Duration: 3-4 hours
Outcome: Master all reactivity utilities
```

| Utility | When to Use | Exercise |
|---------|-------------|----------|
| ref() | Primitives | Counter state |
| reactive() | Objects | Form state |
| readonly() | Immutable exposure | Store state |
| toRef() | Single prop reference | Props handling |
| toRefs() | Destructure reactive | Store destructure |
| shallowRef() | Large objects | Performance opt |
| customRef() | Custom behavior | Debounced input |

### Module 3: Composables Architecture
```
Prerequisites: Modules 1-2
Duration: 4-5 hours
Outcome: Design production composables
```

**Composable Anatomy:**
```typescript
// composables/useFeature.ts
export function useFeature(options?: Options) {
  // 1. State (refs)
  const state = ref(initialValue)

  // 2. Computed (derived)
  const derived = computed(() => transform(state.value))

  // 3. Methods (actions)
  function action() { /* ... */ }

  // 4. Lifecycle (setup/cleanup)
  onMounted(() => { /* setup */ })
  onUnmounted(() => { /* cleanup */ })

  // 5. Return (public API)
  return { state: readonly(state), derived, action }
}
```

| Exercise | Composable | Features |
|----------|------------|----------|
| Data Fetching | useFetch | loading, error, refetch |
| Local Storage | useStorage | sync, parse, stringify |
| Media Query | useMediaQuery | reactive breakpoints |
| Debounce | useDebounce | value, delay |
| Intersection | useIntersection | observer, cleanup |

### Module 4: Provide/Inject Patterns
```
Prerequisites: Module 3
Duration: 2 hours
Outcome: Share state across components
```

| Pattern | Use Case | Example |
|---------|----------|---------|
| Theme Provider | App-wide theming | Dark/light mode |
| Auth Context | User state | Auth provider |
| Config Injection | Feature flags | Runtime config |
| Form Context | Multi-step forms | Form validation |

### Module 5: Advanced Patterns
```
Prerequisites: Modules 1-4
Duration: 3-4 hours
Outcome: Expert-level composition
```

| Pattern | Description | Exercise |
|---------|-------------|----------|
| Composable Composition | Composables using composables | useAuth + useFetch |
| State Machines | Finite state composables | useWizard |
| Plugin Pattern | Extend with plugins | useLogger plugin |
| Async Composables | Handle async setup | useAsyncData |

## Validation Checkpoints

### Beginner Checkpoint
- [ ] Convert Options API to Composition
- [ ] Use ref and computed
- [ ] Write basic composable
- [ ] Use defineProps/Emits

### Intermediate Checkpoint
- [ ] Build reusable composable
- [ ] Implement cleanup in composable
- [ ] Use provide/inject correctly
- [ ] Handle async in composables

### Advanced Checkpoint
- [ ] Design composable library
- [ ] Compose multiple composables
- [ ] Implement SSR-safe composables
- [ ] Test composables in isolation

## Retry Logic

```typescript
const skillConfig = {
  maxAttempts: 3,
  backoffMs: [1000, 2000, 4000],
  onFailure: ''provide_simpler_example''
}
```

## Observability

```yaml
tracking:
  - event: composable_created
    data: [name, complexity_score]
  - event: pattern_learned
    data: [pattern_name, exercises_completed]
  - event: skill_mastery
    data: [modules_completed, project_quality]
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Lost reactivity | Destructured reactive | Use toRefs() |
| inject undefined | Missing provider | Check tree hierarchy |
| Memory leak | No cleanup | Add onUnmounted cleanup |
| Type errors | Wrong generics | Specify type params |

### Debug Steps

1. Verify composable returns refs (not raw values)
2. Check provide/inject key matches
3. Confirm lifecycle hooks are in setup
4. Use Vue Devtools to inspect state

## Unit Test Template

```typescript
import { describe, it, expect } from ''vitest''
import { useCounter } from ''./useCounter''

describe(''useCounter'', () => {
  it(''initializes with default value'', () => {
    const { count } = useCounter()
    expect(count.value).toBe(0)
  })

  it(''increments correctly'', () => {
    const { count, increment } = useCounter()
    increment()
    expect(count.value).toBe(1)
  })

  it(''resets to initial value'', () => {
    const { count, increment, reset } = useCounter(5)
    increment()
    increment()
    reset()
    expect(count.value).toBe(5)
  })
})
```

## Usage

```
Skill("vue-composition-api")
```

## Related Skills

- `vue-fundamentals` - Prerequisite
- `vue-pinia` - State management
- `vue-typescript` - Type-safe composables

## Resources

- [Composition API Guide](https://vuejs.org/guide/reusability/composables.html)
- [VueUse](https://vueuse.org/) - Collection of composables
- [Vue Patterns](https://www.patterns.dev/vue)
' WHERE slug = 'pluginagentmarketplace-vue-composition-api';
UPDATE skills SET content = '---
name: frontend
description: Defines frontend standards for Next.js App Router, React 19, React Query, shadcn/ui. Use when building components, pages, hooks, or frontend state management.
---

# Frontend Architecture & UX

## Stack

- Next.js App Router
- React 19
- React Query (the only remote state manager)
- shadcn/ui + Tailwind CSS

---

## Core Architecture Rules

### Rendering Model

- Server Components by default
- Client Components **only** for interactivity
- No Client Component by convenience
- Client Components must be explicitly justified

### Client Component Boundaries

Client Components **must not**:

- Import Server Components
- Access environment variables
- Perform direct data fetching
- Contain business or domain logic

Client Components **may only**:

- Handle user interaction
- Manage local UI state
- Consume hooks
- Render presentation logic

---

## Layered Responsibilities

- **UI Components**
  - Pure presentation
  - No business rules
  - No data normalization

- **Hooks**
  - Compose UI state
  - Integrate React Query
  - No business decisions

- **Domain / Services**
  - Business rules
  - Decision making
  - Data validation

- **API Layer**
  - HTTP adaptation
  - Contract enforcement
  - Error translation

---

## Data & State Management

- React Query is the **only** remote state manager
- No direct data mutations without React Query
- No fetch calls outside the API layer

### React Query Rules

- Every query must have a stable `queryKey`
- Mutable objects are forbidden in `queryKey`
- All mutations must explicitly invalidate or update cache
- `refetchOnWindowFocus` is disabled by default
- Errors must always be handled explicitly
- Silent failures are forbidden

---

## UX Best Practices

### Accessibility

- Accessibility first
- ARIA roles where applicable
- Full keyboard navigation support
- Respect `prefers-reduced-motion`

### Visual Consistency

- Clear visual hierarchy
- Consistent spacing and typography
- Design tokens must be respected
- Avoid layout shifts (CLS)

### States Handling

Every async interaction **must** define:

- Loading state (prefer skeletons over spinners)
- Error state (user-friendly, not technical)
- Empty state (intentional, not accidental)

Technical errors must **never** be shown directly to users.

---

## Performance Rules

- Minimize client-side JavaScript
- Memoize only when measured or clearly justified
- Defensive memoization is forbidden
- Avoid unnecessary re-renders
- Lazy-load non-critical components only
- Dynamic imports must not affect critical rendering paths

---

## Developer Experience (DX)

- Reusable components over duplication
- Clear, explicit naming
- Prefer composition over configuration
- Avoid deep prop drilling

### Props Discipline

- More than 5 props requires design reconsideration
- Boolean explosion is forbidden (`isA`, `isB`, `isC`)
- Prefer explicit components over conditional flags

---

## Non-Negotiables

- No business logic in UI
- No direct backend calls from components
- No architectural shortcuts
- Predictability over flexibility

Architectural violations are treated as bugs.
' WHERE slug = 'marcusvbda-frontend';
UPDATE skills SET content = '---
name: js-client-context
description: |
  Activate this skill whenever working with Netflix UI code using Hawkins.
  Keywords:
  - Javascript
  - Hawkins, @hawkins/components, @hawkins/variables, @hawkins/assets
  - React, TypeScript, CSS variables
  - Jetpack component, Needlecast
  - appconfig.yaml, .newt.yml with app-type: needlecast or jetpack
  - llm-context, context.md
  - Design system, UI components
user-invocable: false
allowed_tools: mcp__NECP
---

# Hawkins Design System

## Netflix Engineering Context

Use the `get-netflix-engineering-context` tool to get Netflix-specific information about:
- Hawkins component usage and best practices
- React patterns for Netflix UI development
- Accessibility requirements for Netflix applications

## Overview

Hawkins is Netflix''s internal design system. Hawkins package names use the `@hawkins` scope (e.g., `@hawkins/components`).

### When to Use Hawkins

When building UI inside a Jetpack component, first check if the component has Hawkins packages installed. If Hawkins is installed, you MUST use Hawkins to build your UI unless instructed otherwise.

Hawkins packages provide React components, CSS files, and other utilities.

### Learning Hawkins Packages

Before using a Hawkins package, you MUST learn how to use it first.

To find a Hawkins package''s directory:
1. First, look inside `node_modules` at the root of the Jetpack component
2. If not found there, look inside `node_modules` at the repo root

### Package Guidelines

- View package exports by looking inside the `lib` folder (e.g., `node_modules/@hawkins/components/lib`)
- Find component props in TypeScript definition files (e.g., `node_modules/@hawkins/components/lib/button/button.interface.d.ts`)

**Core packages:**

| Package | Contents |
|---------|----------|
| `@hawkins/components` | Core React components |
| `@hawkins/variables` | CSS variables (see `lib/css` directory) |
| `@hawkins/assets` | Icons, pictograms, and emojis |

**Important:** NEVER use the Hawkins `Box` component. It is unnecessary and has poor performance.

### Using LLM Context Files

If a Hawkins package directory contains an `llm-context` folder, use it to learn about the package:

- If the folder contains only one file or an `index.context.md` file, read it for important package information, and for a list of available components
- Component-specific files are named `${COMPONENT_NAME}.context.md` (camelCase)
  - Example: `node_modules/@hawkins/components/llm-context/button.context.md`
- Before using any Hawkins component, you MUST read its context file if one exists

**Important:** `Grep` or `Glob` might return empty results due to `node_modules` being gitignored. Use `LS` and `Read` to explore instead.
' WHERE slug = 'mujuni88-js-client-context';
UPDATE skills SET content = '---
name: discord
description: Use when you need to control Discord from Moltbot via the discord tool: send messages, react, post or upload stickers, upload emojis, run polls, manage threads/pins/search, create/edit/delete channels and categories, fetch permissions or member/role/channel info, or handle moderation actions in Discord DMs or channels.
metadata: {"moltbot":{"emoji":"🎮","requires":{"config":["channels.discord"]}}}
---

# Discord Actions

## Overview

Use `discord` to manage messages, reactions, threads, polls, and moderation. You can disable groups via `discord.actions.*` (defaults to enabled, except roles/moderation). The tool uses the bot token configured for Moltbot.

## Inputs to collect

- For reactions: `channelId`, `messageId`, and an `emoji`.
- For fetchMessage: `guildId`, `channelId`, `messageId`, or a `messageLink` like `https://discord.com/channels/<guildId>/<channelId>/<messageId>`.
- For stickers/polls/sendMessage: a `to` target (`channel:<id>` or `user:<id>`). Optional `content` text.
- Polls also need a `question` plus 2–10 `answers`.
- For media: `mediaUrl` with `file:///path` for local files or `https://...` for remote.
- For emoji uploads: `guildId`, `name`, `mediaUrl`, optional `roleIds` (limit 256KB, PNG/JPG/GIF).
- For sticker uploads: `guildId`, `name`, `description`, `tags`, `mediaUrl` (limit 512KB, PNG/APNG/Lottie JSON).

Message context lines include `discord message id` and `channel` fields you can reuse directly.

**Note:** `sendMessage` uses `to: "channel:<id>"` format, not `channelId`. Other actions like `react`, `readMessages`, `editMessage` use `channelId` directly.
**Note:** `fetchMessage` accepts message IDs or full links like `https://discord.com/channels/<guildId>/<channelId>/<messageId>`.

## Actions

### React to a message

```json
{
  "action": "react",
  "channelId": "123",
  "messageId": "456",
  "emoji": "✅"
}
```

### List reactions + users

```json
{
  "action": "reactions",
  "channelId": "123",
  "messageId": "456",
  "limit": 100
}
```

### Send a sticker

```json
{
  "action": "sticker",
  "to": "channel:123",
  "stickerIds": ["9876543210"],
  "content": "Nice work!"
}
```

- Up to 3 sticker IDs per message.
- `to` can be `user:<id>` for DMs.

### Upload a custom emoji

```json
{
  "action": "emojiUpload",
  "guildId": "999",
  "name": "party_blob",
  "mediaUrl": "file:///tmp/party.png",
  "roleIds": ["222"]
}
```

- Emoji images must be PNG/JPG/GIF and <= 256KB.
- `roleIds` is optional; omit to make the emoji available to everyone.

### Upload a sticker

```json
{
  "action": "stickerUpload",
  "guildId": "999",
  "name": "moltbot_wave",
  "description": "Moltbot waving hello",
  "tags": "👋",
  "mediaUrl": "file:///tmp/wave.png"
}
```

- Stickers require `name`, `description`, and `tags`.
- Uploads must be PNG/APNG/Lottie JSON and <= 512KB.

### Create a poll

```json
{
  "action": "poll",
  "to": "channel:123",
  "question": "Lunch?",
  "answers": ["Pizza", "Sushi", "Salad"],
  "allowMultiselect": false,
  "durationHours": 24,
  "content": "Vote now"
}
```

- `durationHours` defaults to 24; max 32 days (768 hours).

### Check bot permissions for a channel

```json
{
  "action": "permissions",
  "channelId": "123"
}
```

## Ideas to try

- React with ✅/⚠️ to mark status updates.
- Post a quick poll for release decisions or meeting times.
- Send celebratory stickers after successful deploys.
- Upload new emojis/stickers for release moments.
- Run weekly “priority check” polls in team channels.
- DM stickers as acknowledgements when a user’s request is completed.

## Action gating

Use `discord.actions.*` to disable action groups:
- `reactions` (react + reactions list + emojiList)
- `stickers`, `polls`, `permissions`, `messages`, `threads`, `pins`, `search`
- `emojiUploads`, `stickerUploads`
- `memberInfo`, `roleInfo`, `channelInfo`, `voiceStatus`, `events`
- `roles` (role add/remove, default `false`)
- `channels` (channel/category create/edit/delete/move, default `false`)
- `moderation` (timeout/kick/ban, default `false`)
### Read recent messages

```json
{
  "action": "readMessages",
  "channelId": "123",
  "limit": 20
}
```

### Fetch a single message

```json
{
  "action": "fetchMessage",
  "guildId": "999",
  "channelId": "123",
  "messageId": "456"
}
```

```json
{
  "action": "fetchMessage",
  "messageLink": "https://discord.com/channels/999/123/456"
}
```

### Send/edit/delete a message

```json
{
  "action": "sendMessage",
  "to": "channel:123",
  "content": "Hello from Moltbot"
}
```

**With media attachment:**

```json
{
  "action": "sendMessage",
  "to": "channel:123",
  "content": "Check out this audio!",
  "mediaUrl": "file:///tmp/audio.mp3"
}
```

- `to` uses format `channel:<id>` or `user:<id>` for DMs (not `channelId`!)
- `mediaUrl` supports local files (`file:///path/to/file`) and remote URLs (`https://...`)
- Optional `replyTo` with a message ID to reply to a specific message

```json
{
  "action": "editMessage",
  "channelId": "123",
  "messageId": "456",
  "content": "Fixed typo"
}
```

```json
{
  "action": "deleteMessage",
  "channelId": "123",
  "messageId": "456"
}
```

### Threads

```json
{
  "action": "threadCreate",
  "channelId": "123",
  "name": "Bug triage",
  "messageId": "456"
}
```

```json
{
  "action": "threadList",
  "guildId": "999"
}
```

```json
{
  "action": "threadReply",
  "channelId": "777",
  "content": "Replying in thread"
}
```

### Pins

```json
{
  "action": "pinMessage",
  "channelId": "123",
  "messageId": "456"
}
```

```json
{
  "action": "listPins",
  "channelId": "123"
}
```

### Search messages

```json
{
  "action": "searchMessages",
  "guildId": "999",
  "content": "release notes",
  "channelIds": ["123", "456"],
  "limit": 10
}
```

### Member + role info

```json
{
  "action": "memberInfo",
  "guildId": "999",
  "userId": "111"
}
```

```json
{
  "action": "roleInfo",
  "guildId": "999"
}
```

### List available custom emojis

```json
{
  "action": "emojiList",
  "guildId": "999"
}
```

### Role changes (disabled by default)

```json
{
  "action": "roleAdd",
  "guildId": "999",
  "userId": "111",
  "roleId": "222"
}
```

### Channel info

```json
{
  "action": "channelInfo",
  "channelId": "123"
}
```

```json
{
  "action": "channelList",
  "guildId": "999"
}
```

### Channel management (disabled by default)

Create, edit, delete, and move channels and categories. Enable via `discord.actions.channels: true`.

**Create a text channel:**

```json
{
  "action": "channelCreate",
  "guildId": "999",
  "name": "general-chat",
  "type": 0,
  "parentId": "888",
  "topic": "General discussion"
}
```

- `type`: Discord channel type integer (0 = text, 2 = voice, 4 = category; other values supported)
- `parentId`: category ID to nest under (optional)
- `topic`, `position`, `nsfw`: optional

**Create a category:**

```json
{
  "action": "categoryCreate",
  "guildId": "999",
  "name": "Projects"
}
```

**Edit a channel:**

```json
{
  "action": "channelEdit",
  "channelId": "123",
  "name": "new-name",
  "topic": "Updated topic"
}
```

- Supports `name`, `topic`, `position`, `parentId` (null to remove from category), `nsfw`, `rateLimitPerUser`

**Move a channel:**

```json
{
  "action": "channelMove",
  "guildId": "999",
  "channelId": "123",
  "parentId": "888",
  "position": 2
}
```

- `parentId`: target category (null to move to top level)

**Delete a channel:**

```json
{
  "action": "channelDelete",
  "channelId": "123"
}
```

**Edit/delete a category:**

```json
{
  "action": "categoryEdit",
  "categoryId": "888",
  "name": "Renamed Category"
}
```

```json
{
  "action": "categoryDelete",
  "categoryId": "888"
}
```

### Voice status

```json
{
  "action": "voiceStatus",
  "guildId": "999",
  "userId": "111"
}
```

### Scheduled events

```json
{
  "action": "eventList",
  "guildId": "999"
}
```

### Moderation (disabled by default)

```json
{
  "action": "timeout",
  "guildId": "999",
  "userId": "111",
  "durationMinutes": 10
}
```

## Discord Writing Style Guide

**Keep it conversational!** Discord is a chat platform, not documentation.

### Do
- Short, punchy messages (1-3 sentences ideal)
- Multiple quick replies > one wall of text
- Use emoji for tone/emphasis 🦞
- Lowercase casual style is fine
- Break up info into digestible chunks
- Match the energy of the conversation

### Don''t
- No markdown tables (Discord renders them as ugly raw `| text |`)
- No `## Headers` for casual chat (use **bold** or CAPS for emphasis)
- Avoid multi-paragraph essays
- Don''t over-explain simple things
- Skip the "I''d be happy to help!" fluff

### Formatting that works
- **bold** for emphasis
- `code` for technical terms
- Lists for multiple items
- > quotes for referencing
- Wrap multiple links in `<>` to suppress embeds

### Example transformations

❌ Bad:
```
I''d be happy to help with that! Here''s a comprehensive overview of the versioning strategies available:

## Semantic Versioning
Semver uses MAJOR.MINOR.PATCH format where...

## Calendar Versioning
CalVer uses date-based versions like...
```

✅ Good:
```
versioning options: semver (1.2.3), calver (2026.01.04), or yolo (`latest` forever). what fits your release cadence?
```
' WHERE slug = 'az9713-discord';