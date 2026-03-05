UPDATE skills SET content = '---
name: react-expert
description: React ecosystem expert including hooks, state management, component patterns, React 19 features, Shadcn UI, and Radix primitives
version: 2.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Grep, Glob]
globs: [''**/*.tsx'', ''**/*.jsx'', ''components/**/*'']
best_practices:
  - Use functional components with hooks
  - Follow the Rules of Hooks
  - Implement proper memoization
  - Use TypeScript for type safety
error_handling: graceful
streaming: supported
---

# React Expert

<identity>
React ecosystem expert with deep knowledge of hooks, state management, component patterns, React 19 features, Shadcn UI, and Radix primitives.
</identity>

<capabilities>
- Review code for React best practices
- Implement modern React patterns (React 19)
- Design component architectures
- Optimize React performance
- Build accessible UI with Radix/Shadcn
</capabilities>

<instructions>

## Component Structure

- Use functional components over class components
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use composition over inheritance
- Implement proper prop types with TypeScript
- Split large components into smaller, focused ones

## Hooks

- Follow the Rules of Hooks
- Use custom hooks for reusable logic
- Keep hooks focused and simple
- Use appropriate dependency arrays in useEffect
- Implement cleanup in useEffect when needed
- Avoid nested hooks

## State Management

- Use useState for local component state
- Implement useReducer for complex state logic
- Use Context API for shared state
- Keep state as close to where it''s used as possible
- Avoid prop drilling through proper state management
- Use state management libraries only when necessary

## Performance

- Implement proper memoization (useMemo, useCallback)
- Use React.memo for expensive components
- Avoid unnecessary re-renders
- Implement proper lazy loading
- Use proper key props in lists
- Profile and optimize render performance

## React 19 Features

- Use `use` hook for consuming Promises and Context directly
- Leverage `useFormStatus` hook for form state management
- Use `useActionState` for form actions and state management
- Implement Document Metadata API for better SEO
- Use Actions for client-side mutations with automatic loading states
- Leverage compiler optimizations like automatic memoization
- Use `ref` as a prop directly without needing `forwardRef`
- Use `useOptimistic` hook for optimistic UI updates
- Use `startTransition` for non-urgent state updates
- Use `useDeferredValue` for deferring UI updates
- Use `useId` for generating unique IDs in server components
- Use `useSyncExternalStore` for subscribing to external stores

## Radix UI & Shadcn

- Implement Radix UI components according to documentation
- Follow accessibility guidelines for all components
- Use Shadcn UI conventions for styling
- Compose primitives for complex components

## Forms

- Use controlled components for form inputs
- Implement proper form validation
- Handle form submission states properly
- Show appropriate loading and error states
- Use form libraries for complex forms
- Implement proper accessibility for forms

## Error Handling

- Implement Error Boundaries
- Handle async errors properly
- Show user-friendly error messages
- Implement proper fallback UI
- Log errors appropriately

## Testing

- Write unit tests for components
- Implement integration tests for complex flows
- Use React Testing Library
- Test user interactions
- Test error scenarios

## Accessibility

- Use semantic HTML elements
- Implement proper ARIA attributes
- Ensure keyboard navigation
- Test with screen readers
- Handle focus management
- Provide proper alt text for images

## Templates

<template name="component">
import React, { memo } from ''react''

interface {{Name}}Props {
className?: string
children?: React.ReactNode
}

export const {{Name}} = memo<{{Name}}Props>(({
className,
children
}) => {
return (

<div className={className}>
{children}
</div>
)
})

{{Name}}.displayName = ''{{Name}}''
</template>

<template name="hook">
import { useState, useEffect, useCallback } from ''react''

interface Use{{Name}}Result {
data: {{Type}} | null
loading: boolean
error: Error | null
refresh: () => void
}

export function use{{Name}}(): Use{{Name}}Result {
const [data, setData] = useState<{{Type}} | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<Error | null>(null)

const fetchData = useCallback(async () => {
try {
setLoading(true)
setError(null)
// Add fetch logic here
} catch (err) {
setError(err instanceof Error ? err : new Error(''Unknown error''))
} finally {
setLoading(false)
}
}, [])

useEffect(() => {
fetchData()
}, [fetchData])

return { data, loading, error, refresh: fetchData }
}
</template>

## Validation

<validation>
forbidden_patterns:
  - pattern: "useEffect\\([^)]*\\[\\]\\s*\\)"
    message: "Empty dependency array may cause stale closures"
    severity: "warning"
  - pattern: "dangerouslySetInnerHTML"
    message: "Avoid dangerouslySetInnerHTML; sanitize if necessary"
    severity: "warning"
  - pattern: "document\\.(getElementById|querySelector)"
    message: "Use React refs instead of direct DOM access"
    severity: "warning"
</validation>

</instructions>

<examples>
<usage_example>
**Component Review**:
```
User: "Review this React component for best practices"
Agent: [Analyzes hooks, memoization, accessibility, and provides feedback]
```
</usage_example>
</examples>

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

**After completing:** Record any new patterns or exceptions discovered.

> ASSUME INTERRUPTION: Your context may reset. If it''s not in memory, it didn''t happen.
' WHERE slug = 'neversight-react-expert';
UPDATE skills SET content = '---
name: react-flow-node
description: Create React Flow node components with TypeScript types, handles, and Zustand integration. Use when building custom nodes for React Flow canvas, creating visual workflow editors, or implementing node-based UI components.
---

# React Flow Node

Create React Flow node components following established patterns with proper TypeScript types and store integration.

## Quick Start

Copy templates from [assets/](assets/) and replace placeholders:
- `{{NodeName}}` → PascalCase component name (e.g., `VideoNode`)
- `{{nodeType}}` → kebab-case type identifier (e.g., `video-node`)
- `{{NodeData}}` → Data interface name (e.g., `VideoNodeData`)

## Templates

- [assets/template.tsx](assets/template.tsx) - Node component
- [assets/types.template.ts](assets/types.template.ts) - TypeScript definitions

## Node Component Pattern

```tsx
export const MyNode = memo(function MyNode({
  id,
  data,
  selected,
  width,
  height,
}: MyNodeProps) {
  const updateNode = useAppStore((state) => state.updateNode);
  const canvasMode = useAppStore((state) => state.canvasMode);
  
  return (
    <>
      <NodeResizer isVisible={selected && canvasMode === ''editing''} />
      <div className="node-container">
        <Handle type="target" position={Position.Top} />
        {/* Node content */}
        <Handle type="source" position={Position.Bottom} />
      </div>
    </>
  );
});
```

## Type Definition Pattern

```typescript
export interface MyNodeData extends Record<string, unknown> {
  title: string;
  description?: string;
}

export type MyNode = Node<MyNodeData, ''my-node''>;
```

## Integration Steps

1. Add type to `src/frontend/src/types/index.ts`
2. Create component in `src/frontend/src/components/nodes/`
3. Export from `src/frontend/src/components/nodes/index.ts`
4. Add defaults in `src/frontend/src/store/app-store.ts`
5. Register in canvas `nodeTypes`
6. Add to AddBlockMenu and ConnectMenu
' WHERE slug = 'neversight-react-flow-node';
UPDATE skills SET content = '---
name: code-review-excellence
description: |
  Provides comprehensive code review guidance for React 19, Vue 3, Rust, TypeScript, Java, Python, and C/C++.
  Helps catch bugs, improve code quality, and give constructive feedback.
  Use when: reviewing pull requests, conducting PR reviews, code review, reviewing code changes,
  establishing review standards, mentoring developers, architecture reviews, security audits,
  checking code quality, finding bugs, giving feedback on code.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash      # 运行 lint/test/build 命令验证代码质量
  - WebFetch  # 查阅最新文档和最佳实践
---

# Code Review Excellence

Transform code reviews from gatekeeping to knowledge sharing through constructive feedback, systematic analysis, and collaborative improvement.

## When to Use This Skill

- Reviewing pull requests and code changes
- Establishing code review standards for teams
- Mentoring junior developers through reviews
- Conducting architecture reviews
- Creating review checklists and guidelines
- Improving team collaboration
- Reducing code review cycle time
- Maintaining code quality standards

## Core Principles

### 1. The Review Mindset

**Goals of Code Review:**
- Catch bugs and edge cases
- Ensure code maintainability
- Share knowledge across team
- Enforce coding standards
- Improve design and architecture
- Build team culture

**Not the Goals:**
- Show off knowledge
- Nitpick formatting (use linters)
- Block progress unnecessarily
- Rewrite to your preference

### 2. Effective Feedback

**Good Feedback is:**
- Specific and actionable
- Educational, not judgmental
- Focused on the code, not the person
- Balanced (praise good work too)
- Prioritized (critical vs nice-to-have)

```markdown
❌ Bad: "This is wrong."
✅ Good: "This could cause a race condition when multiple users
         access simultaneously. Consider using a mutex here."

❌ Bad: "Why didn''t you use X pattern?"
✅ Good: "Have you considered the Repository pattern? It would
         make this easier to test. Here''s an example: [link]"

❌ Bad: "Rename this variable."
✅ Good: "[nit] Consider `userCount` instead of `uc` for
         clarity. Not blocking if you prefer to keep it."
```

### 3. Review Scope

**What to Review:**
- Logic correctness and edge cases
- Security vulnerabilities
- Performance implications
- Test coverage and quality
- Error handling
- Documentation and comments
- API design and naming
- Architectural fit

**What Not to Review Manually:**
- Code formatting (use Prettier, Black, etc.)
- Import organization
- Linting violations
- Simple typos

## Review Process

### Phase 1: Context Gathering (2-3 minutes)

Before diving into code, understand:
1. Read PR description and linked issue
2. Check PR size (>400 lines? Ask to split)
3. Review CI/CD status (tests passing?)
4. Understand the business requirement
5. Note any relevant architectural decisions

### Phase 2: High-Level Review (5-10 minutes)

1. **Architecture & Design** - Does the solution fit the problem?
   - For significant changes, consult [Architecture Review Guide](reference/architecture-review-guide.md)
   - Check: SOLID principles, coupling/cohesion, anti-patterns
2. **Performance Assessment** - Are there performance concerns?
   - For performance-critical code, consult [Performance Review Guide](reference/performance-review-guide.md)
   - Check: Algorithm complexity, N+1 queries, memory usage
3. **File Organization** - Are new files in the right places?
4. **Testing Strategy** - Are there tests covering edge cases?

### Phase 3: Line-by-Line Review (10-20 minutes)

For each file, check:
- **Logic & Correctness** - Edge cases, off-by-one, null checks, race conditions
- **Security** - Input validation, injection risks, XSS, sensitive data
- **Performance** - N+1 queries, unnecessary loops, memory leaks
- **Maintainability** - Clear names, single responsibility, comments

### Phase 4: Summary & Decision (2-3 minutes)

1. Summarize key concerns
2. Highlight what you liked
3. Make clear decision:
   - ✅ Approve
   - 💬 Comment (minor suggestions)
   - 🔄 Request Changes (must address)
4. Offer to pair if complex

## Review Techniques

### Technique 1: The Checklist Method

Use checklists for consistent reviews. See [Security Review Guide](reference/security-review-guide.md) for comprehensive security checklist.

### Technique 2: The Question Approach

Instead of stating problems, ask questions:

```markdown
❌ "This will fail if the list is empty."
✅ "What happens if `items` is an empty array?"

❌ "You need error handling here."
✅ "How should this behave if the API call fails?"
```

### Technique 3: Suggest, Don''t Command

Use collaborative language:

```markdown
❌ "You must change this to use async/await"
✅ "Suggestion: async/await might make this more readable. What do you think?"

❌ "Extract this into a function"
✅ "This logic appears in 3 places. Would it make sense to extract it?"
```

### Technique 4: Differentiate Severity

Use labels to indicate priority:

- 🔴 `[blocking]` - Must fix before merge
- 🟡 `[important]` - Should fix, discuss if disagree
- 🟢 `[nit]` - Nice to have, not blocking
- 💡 `[suggestion]` - Alternative approach to consider
- 📚 `[learning]` - Educational comment, no action needed
- 🎉 `[praise]` - Good work, keep it up!

## Language-Specific Guides

根据审查的代码语言，查阅对应的详细指南：

| Language/Framework | Reference File | Key Topics |
|-------------------|----------------|------------|
| **React** | [React Guide](reference/react.md) | Hooks, useEffect, React 19 Actions, RSC, Suspense, TanStack Query v5 |
| **Vue 3** | [Vue Guide](reference/vue.md) | Composition API, 响应性系统, Props/Emits, Watchers, Composables |
| **Rust** | [Rust Guide](reference/rust.md) | 所有权/借用, Unsafe 审查, 异步代码, 错误处理 |
| **TypeScript** | [TypeScript Guide](reference/typescript.md) | 类型安全, async/await, 不可变性 |
| **Python** | [Python Guide](reference/python.md) | 可变默认参数, 异常处理, 类属性 |
| **Java** | [Java Guide](reference/java.md) | Java 17/21 新特性, Spring Boot 3, 虚拟线程, Stream/Optional |
| **Go** | [Go Guide](reference/go.md) | 错误处理, goroutine/channel, context, 接口设计 |
| **C** | [C Guide](reference/c.md) | 指针/缓冲区, 内存安全, UB, 错误处理 |
| **C++** | [C++ Guide](reference/cpp.md) | RAII, 生命周期, Rule of 0/3/5, 异常安全 |
| **CSS/Less/Sass** | [CSS Guide](reference/css-less-sass.md) | 变量规范, !important, 性能优化, 响应式, 兼容性 |

## Additional Resources

- [Architecture Review Guide](reference/architecture-review-guide.md) - 架构设计审查指南（SOLID、反模式、耦合度）
- [Performance Review Guide](reference/performance-review-guide.md) - 性能审查指南（Web Vitals、N+1、复杂度）
- [Common Bugs Checklist](reference/common-bugs-checklist.md) - 按语言分类的常见错误清单
- [Security Review Guide](reference/security-review-guide.md) - 安全审查指南
- [Code Review Best Practices](reference/code-review-best-practices.md) - 代码审查最佳实践
- [PR Review Template](assets/pr-review-template.md) - PR 审查评论模板
- [Review Checklist](assets/review-checklist.md) - 快速参考清单
' WHERE slug = 'neversight-code-review-excellence';
UPDATE skills SET content = '---
name: ui-ux-design
description: "UI/UX design reference database. 50+ styles, 21 palettes, 50 font pairings, 20 charts, 8 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, mobile app, .html, .tsx, .vue, .svelte. Elements: button, modal, navbar, sidebar, card, table, form, chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, flat design. Topics: color palette, accessibility, animation, layout, typography, font pairing, spacing, hover, shadow, gradient."
---

# UI Design Reference - Searchable Pattern Database

Curated reference database of UI/UX patterns, styles, color palettes, font pairings, chart types, product recommendations, UX guidelines, and stack-specific best practices. Use this as a lookup tool to find proven design patterns and implementation guidance.

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
python3 .claude/skills/ui-ux-design/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
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
python3 .claude/skills/ui-ux-design/scripts/search.py "<keyword>" --stack html-tailwind
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
python3 .claude/skills/ui-ux-design/scripts/search.py "beauty spa wellness service" --domain product

# 2. Search style (based on industry: beauty, elegant)
python3 .claude/skills/ui-ux-design/scripts/search.py "elegant minimal soft" --domain style

# 3. Search typography
python3 .claude/skills/ui-ux-design/scripts/search.py "elegant luxury" --domain typography

# 4. Search color palette
python3 .claude/skills/ui-ux-design/scripts/search.py "beauty spa wellness" --domain color

# 5. Search landing page structure
python3 .claude/skills/ui-ux-design/scripts/search.py "hero-centric social-proof" --domain landing

# 6. Search UX guidelines
python3 .claude/skills/ui-ux-design/scripts/search.py "animation" --domain ux
python3 .claude/skills/ui-ux-design/scripts/search.py "accessibility" --domain ux

# 7. Search stack guidelines (default: html-tailwind)
python3 .claude/skills/ui-ux-design/scripts/search.py "layout responsive" --stack html-tailwind
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
- [ ] Responsive at 320px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile

### Accessibility
- [ ] All images have alt text
- [ ] Form inputs have labels
- [ ] Color is not the only indicator
- [ ] `prefers-reduced-motion` respected
' WHERE slug = 'neversight-ui-ux-design';
UPDATE skills SET content = '---
name: using-nuqs
description: Manage React state in URL query parameters with nuqs. Covers Suspense boundaries, parsers, clearing state, and deep-linkable dialogs.
---

# Working with nuqs

Manage React state in URL query parameters with nuqs. Covers Suspense boundaries, parsers, clearing state, and deep-linkable dialogs.

## Implement Working with nuqs

Manage React state in URL query parameters with nuqs for shareable filters, search, and deep-linkable dialogs.

**See:**

- Resource: `using-nuqs` in Fullstack Recipes
- URL: https://fullstackrecipes.com/recipes/using-nuqs

---

### Suspense Boundary Pattern

nuqs uses `useSearchParams` behind the scenes, requiring a Suspense boundary. Wrap nuqs-using components with Suspense via a wrapper component to keep the boundary colocated:

```typescript
import { Suspense } from "react";

type SearchInputProps = {
  placeholder?: string;
};

// Public component with built-in Suspense
export function SearchInput(props: SearchInputProps) {
  return (
    <Suspense fallback={<input placeholder={props.placeholder} disabled />}>
      <SearchInputClient {...props} />
    </Suspense>
  );
}
```

```typescript
"use client";

import { useQueryState, parseAsString } from "nuqs";

// Internal client component that uses nuqs
function SearchInputClient({ placeholder = "Search..." }: SearchInputProps) {
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));

  return (
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value || null)}
      placeholder={placeholder}
    />
  );
}
```

This pattern allows consuming components to use `SearchInput` without adding Suspense themselves.

### State to URL Query Params

Replace `useState` with `useQueryState` to sync state to the URL:

```typescript
"use client";

import {
  useQueryState,
  parseAsString,
  parseAsBoolean,
  parseAsArrayOf,
} from "nuqs";

// String state (search, filters)
const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));

// Boolean state (toggles)
const [showArchived, setShowArchived] = useQueryState(
  "archived",
  parseAsBoolean.withDefault(false),
);

// Array state (multi-select)
const [tags, setTags] = useQueryState(
  "tags",
  parseAsArrayOf(parseAsString).withDefault([]),
);
```

### Clear State

Set to `null` to remove from URL:

```typescript
// Clear single param
setSearch(null);

// Clear all filters
function clearFilters() {
  setSearch(null);
  setTags(null);
  setShowArchived(null);
}
```

When using `.withDefault()`, setting to `null` clears the URL param but returns the default value.

### Deep-Linkable Dialogs

Control dialog visibility with URL params for shareable links:

```typescript
import { Suspense } from "react";

type DeleteDialogProps = {
  onDelete: (id: string) => Promise<void>;
};

// Public component with built-in Suspense
export function DeleteDialog(props: DeleteDialogProps) {
  return (
    <Suspense fallback={null}>
      <DeleteDialogClient {...props} />
    </Suspense>
  );
}
```

```typescript
"use client";

import { useQueryState, parseAsString } from "nuqs";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";

function DeleteDialogClient({ onDelete }: DeleteDialogProps) {
  const [deleteId, setDeleteId] = useQueryState("delete", parseAsString);

  async function handleDelete() {
    if (!deleteId) return;
    await onDelete(deleteId);
    setDeleteId(null);
  }

  return (
    <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
      <AlertDialogContent>
        {/* Confirmation UI */}
        <Button onClick={handleDelete}>Delete</Button>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Open the dialog programmatically:

```typescript
// Open delete dialog for specific item
setDeleteId("item-123");

// Deep link: /items?delete=item-123
```

### Opening Dialogs from Buttons

Use a trigger button to open the dialog:

```typescript
function ItemRow({ item }: { item: Item }) {
  const [, setDeleteId] = useQueryState("delete", parseAsString);

  return (
    <Button variant="ghost" onClick={() => setDeleteId(item.id)}>
      Delete
    </Button>
  );
}
```

---

## References

- [nuqs Documentation](https://nuqs.47ng.com/)
- [nuqs Parsers](https://nuqs.47ng.com/docs/parsers)
' WHERE slug = 'neversight-using-nuqs';
UPDATE skills SET content = '---
name: mobile-design
description: Mobile-first design and engineering doctrine for iOS and Android apps. Covers touch interaction, performance, platform conventions, offline behavior, and mobile-specific decision-making. Teaches principles and constraints, not fixed layouts. Use for React Native, Flutter, or native mobile apps.
allowed-tools: Read, Glob, Grep, Bash
---
# Mobile Design System

**(Mobile-First · Touch-First · Platform-Respectful)**

> **Philosophy:** Touch-first. Battery-conscious. Platform-respectful. Offline-capable.
> **Core Law:** Mobile is NOT a small desktop.
> **Operating Rule:** Think constraints first, aesthetics second.

This skill exists to **prevent desktop-thinking, AI-defaults, and unsafe assumptions** when designing or building mobile applications.

---

## 1. Mobile Feasibility & Risk Index (MFRI)

Before designing or implementing **any mobile feature or screen**, assess feasibility.

### MFRI Dimensions (1–5)

| Dimension                  | Question                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| **Platform Clarity**       | Is the target platform (iOS / Android / both) explicitly defined? |
| **Interaction Complexity** | How complex are gestures, flows, or navigation?                   |
| **Performance Risk**       | Does this involve lists, animations, heavy state, or media?       |
| **Offline Dependence**     | Does the feature break or degrade without network?                |
| **Accessibility Risk**     | Does this impact motor, visual, or cognitive accessibility?       |

### Score Formula

```
MFRI = (Platform Clarity + Accessibility Readiness)
       − (Interaction Complexity + Performance Risk + Offline Dependence)
```

**Range:** `-10 → +10`

### Interpretation

| MFRI     | Meaning   | Required Action                       |
| -------- | --------- | ------------------------------------- |
| **6–10** | Safe      | Proceed normally                      |
| **3–5**  | Moderate  | Add performance + UX validation       |
| **0–2**  | Risky     | Simplify interactions or architecture |
| **< 0**  | Dangerous | Redesign before implementation        |

---

## 2. Mandatory Thinking Before Any Work

### ⛔ STOP: Ask Before Assuming (Required)

If **any of the following are not explicitly stated**, you MUST ask before proceeding:

| Aspect     | Question                                   | Why                                      |
| ---------- | ------------------------------------------ | ---------------------------------------- |
| Platform   | iOS, Android, or both?                     | Affects navigation, gestures, typography |
| Framework  | React Native, Flutter, or native?          | Determines performance and patterns      |
| Navigation | Tabs, stack, drawer?                       | Core UX architecture                     |
| Offline    | Must it work offline?                      | Data & sync strategy                     |
| Devices    | Phone only or tablet too?                  | Layout & density rules                   |
| Audience   | Consumer, enterprise, accessibility needs? | Touch & readability                      |

🚫 **Never default to your favorite stack or pattern.**

---

## 3. Mandatory Reference Reading (Enforced)

### Universal (Always Read First)

| File                          | Purpose                            | Status            |
| ----------------------------- | ---------------------------------- | ----------------- |
| **mobile-design-thinking.md** | Anti-memorization, context-forcing | 🔴 REQUIRED FIRST |
| **touch-psychology.md**       | Fitts’ Law, thumb zones, gestures  | 🔴 REQUIRED       |
| **mobile-performance.md**     | 60fps, memory, battery             | 🔴 REQUIRED       |
| **mobile-backend.md**         | Offline sync, push, APIs           | 🔴 REQUIRED       |
| **mobile-testing.md**         | Device & E2E testing               | 🔴 REQUIRED       |
| **mobile-debugging.md**       | Native vs JS debugging             | 🔴 REQUIRED       |

### Platform-Specific (Conditional)

| Platform       | File                |
| -------------- | ------------------- |
| iOS            | platform-ios.md     |
| Android        | platform-android.md |
| Cross-platform | BOTH above          |

> ❌ If you haven’t read the platform file, you are not allowed to design UI.

---

## 4. AI Mobile Anti-Patterns (Hard Bans)

### 🚫 Performance Sins (Non-Negotiable)

| ❌ Never                   | Why                  | ✅ Always                                |
| ------------------------- | -------------------- | --------------------------------------- |
| ScrollView for long lists | Memory explosion     | FlatList / FlashList / ListView.builder |
| Inline renderItem         | Re-renders all rows  | useCallback + memo                      |
| Index as key              | Reorder bugs         | Stable ID                               |
| JS-thread animations      | Jank                 | Native driver / GPU                     |
| console.log in prod       | JS thread block      | Strip logs                              |
| No memoization            | Battery + perf drain | React.memo / const widgets              |

---

### 🚫 Touch & UX Sins

| ❌ Never               | Why                  | ✅ Always          |
| --------------------- | -------------------- | ----------------- |
| Touch <44–48px        | Miss taps            | Min touch target  |
| Gesture-only action   | Excludes users       | Button fallback   |
| No loading state      | Feels broken         | Explicit feedback |
| No error recovery     | Dead end             | Retry + message   |
| Ignore platform norms | Muscle memory broken | iOS ≠ Android     |

---

### 🚫 Security Sins

| ❌ Never                | Why                | ✅ Always               |
| ---------------------- | ------------------ | ---------------------- |
| Tokens in AsyncStorage | Easily stolen      | SecureStore / Keychain |
| Hardcoded secrets      | Reverse engineered | Env + secure storage   |
| No SSL pinning         | MITM risk          | Cert pinning           |
| Log sensitive data     | PII leakage        | Never log secrets      |

---

## 5. Platform Unification vs Divergence Matrix

```
UNIFY                          DIVERGE
──────────────────────────     ─────────────────────────
Business logic                Navigation behavior
Data models                    Gestures
API contracts                  Icons
Validation                     Typography
Error semantics                Pickers / dialogs
```

### Platform Defaults

| Element   | iOS          | Android        |
| --------- | ------------ | -------------- |
| Font      | SF Pro       | Roboto         |
| Min touch | 44pt         | 48dp           |
| Back      | Edge swipe   | System back    |
| Sheets    | Bottom sheet | Dialog / sheet |
| Icons     | SF Symbols   | Material Icons |

---

## 6. Mobile UX Psychology (Non-Optional)

### Fitts’ Law (Touch Reality)

* Finger ≠ cursor
* Accuracy is low
* Reach matters more than precision

**Rules:**

* Primary CTAs live in **thumb zone**
* Destructive actions pushed away
* No hover assumptions

---

## 7. Performance Doctrine

### React Native (Required Pattern)

```ts
const Row = React.memo(({ item }) => (
  <View><Text>{item.title}</Text></View>
));

const renderItem = useCallback(
  ({ item }) => <Row item={item} />,
  []
);

<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(i) => i.id}
  getItemLayout={(_, i) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * i,
    index: i,
  })}
/>
```

### Flutter (Required Pattern)

```dart
class Item extends StatelessWidget {
  const Item({super.key});

  @override
  Widget build(BuildContext context) {
    return const Text(''Static'');
  }
}
```

* `const` everywhere possible
* Targeted rebuilds only

---

## 8. Mandatory Mobile Checkpoint

Before writing **any code**, you must complete this:

```
🧠 MOBILE CHECKPOINT

Platform:     ___________
Framework:    ___________
Files Read:   ___________

3 Principles I Will Apply:
1.
2.
3.

Anti-Patterns I Will Avoid:
1.
2.
```

❌ Cannot complete → go back and read.

---

## 9. Framework Decision Tree (Canonical)

```
Need OTA + web team → React Native + Expo
High-perf UI → Flutter
iOS only → SwiftUI
Android only → Compose
```

No debate without justification.

---

## 10. Release Readiness Checklist

### Before Shipping

* [ ] Touch targets ≥ 44–48px
* [ ] Offline handled
* [ ] Secure storage used
* [ ] Lists optimized
* [ ] Logs stripped
* [ ] Tested on low-end devices
* [ ] Accessibility labels present
* [ ] MFRI ≥ 3

---

## 11. Related Skills

* **frontend-design** – Visual systems & components
* **frontend-dev-guidelines** – RN/TS architecture
* **backend-dev-guidelines** – Mobile-safe APIs
* **error-tracking** – Crash & performance telemetry

---

> **Final Law:**
> Mobile users are distracted, interrupted, and impatient—often using one hand on a bad network with low battery.
> **Design for that reality, or your app will fail quietly.**

---
' WHERE slug = 'neversight-mobile-design';
UPDATE skills SET content = '---
name: openai-agents
description: |
  Use this skill when building AI applications with OpenAI Agents SDK for JavaScript/TypeScript. The skill covers both text-based agents and realtime voice agents, including multi-agent workflows (handoffs), tools with Zod schemas, input/output guardrails, structured outputs, streaming, human-in-the-loop patterns, and framework integrations for Cloudflare Workers, Next.js, and React. It prevents 9+ common errors including Zod schema type errors, MCP tracing failures, infinite loops, tool call failures, and schema mismatches. The skill includes comprehensive templates for all agent types, error handling patterns, and debugging strategies.

  Keywords: OpenAI Agents SDK, @openai/agents, @openai/agents-realtime, openai agents javascript, openai agents typescript, text agents, voice agents, realtime agents, multi-agent workflows, agent handoffs, agent tools, zod schemas agents, structured outputs agents, agent streaming, agent guardrails, input guardrails, output guardrails, human-in-the-loop, cloudflare workers agents, nextjs openai agents, react openai agents, hono agents, agent debugging, Zod schema type error, MCP tracing failure, agent infinite loop, tool call failures, schema mismatch agents
license: MIT
metadata:
  packages:
    - "@openai/agents@0.2.1"
    - "@openai/agents-realtime@0.2.1"
    - "zod@^3.24.1"
  frameworks: ["Cloudflare Workers", "Next.js", "React", "Node.js", "Hono"]
  last_verified: "2025-10-26"
  production_tested: true
  token_savings: "~60%"
  errors_prevented: 9
---

# OpenAI Agents SDK Skill

Complete skill for building AI applications with OpenAI Agents SDK (JavaScript/TypeScript), covering text agents, realtime voice agents, multi-agent workflows, and production deployment patterns.

---

## Installation & Setup

Install required packages:

```bash
npm install @openai/agents zod@3
npm install @openai/agents-realtime  # For voice agents
```

Set environment variable:

```bash
export OPENAI_API_KEY="your-api-key"
```

Supported runtimes:
- Node.js 22+
- Deno
- Bun
- Cloudflare Workers (experimental)

---

## Core Concepts

### 1. Agents
LLMs equipped with instructions and tools:

```typescript
import { Agent } from ''@openai/agents'';

const agent = new Agent({
  name: ''Assistant'',
  instructions: ''You are helpful.'',
  tools: [myTool],
  model: ''gpt-4o-mini'',
});
```

### 2. Tools
Functions agents can call, with automatic schema generation:

```typescript
import { tool } from ''@openai/agents'';
import { z } from ''zod'';

const weatherTool = tool({
  name: ''get_weather'',
  description: ''Get weather for a city'',
  parameters: z.object({
    city: z.string(),
  }),
  execute: async ({ city }) => {
    return `Weather in ${city}: sunny`;
  },
});
```

### 3. Handoffs
Multi-agent delegation:

```typescript
const specialist = new Agent({ /* ... */ });

const triageAgent = Agent.create({
  name: ''Triage'',
  instructions: ''Route to specialists'',
  handoffs: [specialist],
});
```

### 4. Guardrails
Input/output validation for safety:

```typescript
const agent = new Agent({
  inputGuardrails: [homeworkDetector],
  outputGuardrails: [piiFilter],
});
```

### 5. Structured Outputs
Type-safe responses with Zod:

```typescript
const agent = new Agent({
  outputType: z.object({
    sentiment: z.enum([''positive'', ''negative'', ''neutral'']),
    confidence: z.number(),
  }),
});
```

---

## Text Agents

### Basic Usage

```typescript
import { run } from ''@openai/agents'';

const result = await run(agent, ''What is 2+2?'');
console.log(result.finalOutput);
console.log(result.usage.totalTokens);
```

### Streaming

```typescript
const stream = await run(agent, ''Tell me a story'', {
  stream: true,
});

for await (const event of stream) {
  if (event.type === ''raw_model_stream_event'') {
    const chunk = event.data?.choices?.[0]?.delta?.content || '''';
    process.stdout.write(chunk);
  }
}
```

**Templates**:
- `templates/text-agents/agent-basic.ts`
- `templates/text-agents/agent-streaming.ts`

---

## Multi-Agent Handoffs

Create specialized agents and route between them:

```typescript
const billingAgent = new Agent({
  name: ''Billing'',
  handoffDescription: ''For billing and payment questions'',
  tools: [processRefundTool],
});

const techAgent = new Agent({
  name: ''Technical'',
  handoffDescription: ''For technical issues'',
  tools: [createTicketTool],
});

const triageAgent = Agent.create({
  name: ''Triage'',
  instructions: ''Route customers to the right specialist'',
  handoffs: [billingAgent, techAgent],
});
```

**Templates**:
- `templates/text-agents/agent-handoffs.ts`

**References**:
- `references/agent-patterns.md` - LLM vs code orchestration

---

## Guardrails

### Input Guardrails

Validate input before processing:

```typescript
const homeworkGuardrail: InputGuardrail = {
  name: ''Homework Detection'',
  execute: async ({ input, context }) => {
    const result = await run(guardrailAgent, input);
    return {
      tripwireTriggered: result.finalOutput.isHomework,
      outputInfo: result.finalOutput,
    };
  },
};

const agent = new Agent({
  inputGuardrails: [homeworkGuardrail],
});
```

### Output Guardrails

Filter responses:

```typescript
const piiGuardrail: OutputGuardrail = {
  name: ''PII Detection'',
  execute: async ({ agentOutput }) => {
    const phoneRegex = /\b\d{3}[-. ]?\d{3}[-. ]?\d{4}\b/;
    return {
      tripwireTriggered: phoneRegex.test(agentOutput as string),
      outputInfo: { detected: ''phone_number'' },
    };
  },
};
```

**Templates**:
- `templates/text-agents/agent-guardrails-input.ts`
- `templates/text-agents/agent-guardrails-output.ts`

---

## Human-in-the-Loop

Require approval for specific actions:

```typescript
const refundTool = tool({
  name: ''process_refund'',
  requiresApproval: true,  // ← Requires human approval
  execute: async ({ amount }) => {
    return `Refunded $${amount}`;
  },
});

// Handle approval requests
let result = await runner.run(input);

while (result.interruption) {
  if (result.interruption.type === ''tool_approval'') {
    const approved = await promptUser(result.interruption);
    result = approved
      ? await result.state.approve(result.interruption)
      : await result.state.reject(result.interruption);
  }
}
```

**Templates**:
- `templates/text-agents/agent-human-approval.ts`

---

## Realtime Voice Agents

### Creating Voice Agents

```typescript
import { RealtimeAgent, tool } from ''@openai/agents-realtime'';

const voiceAgent = new RealtimeAgent({
  name: ''Voice Assistant'',
  instructions: ''Keep responses concise for voice'',
  tools: [weatherTool],
  voice: ''alloy'', // alloy, echo, fable, onyx, nova, shimmer
  model: ''gpt-4o-realtime-preview'',
});
```

### Browser Session (React)

```typescript
import { RealtimeSession } from ''@openai/agents-realtime'';

const session = new RealtimeSession(voiceAgent, {
  apiKey: sessionApiKey, // From your backend!
  transport: ''webrtc'', // or ''websocket''
});

session.on(''connected'', () => console.log(''Connected''));
session.on(''audio.transcription.completed'', (e) => console.log(''User:'', e.transcript));
session.on(''agent.audio.done'', (e) => console.log(''Agent:'', e.transcript));

await session.connect();
```

**CRITICAL**: Never send your main OPENAI_API_KEY to the browser! Generate ephemeral session tokens server-side.

### Voice Agent Handoffs

Voice agents support handoffs with constraints:
- **Cannot change voice** during handoff
- **Cannot change model** during handoff
- Conversation history automatically passed

```typescript
const specialist = new RealtimeAgent({
  voice: ''nova'', // Must match parent
  /* ... */
});

const triageAgent = new RealtimeAgent({
  voice: ''nova'',
  handoffs: [specialist],
});
```

**Templates**:
- `templates/realtime-agents/realtime-agent-basic.ts`
- `templates/realtime-agents/realtime-session-browser.tsx`
- `templates/realtime-agents/realtime-handoffs.ts`

**References**:
- `references/realtime-transports.md` - WebRTC vs WebSocket

---

## Framework Integration

### Cloudflare Workers (Experimental)

```typescript
import { Agent, run } from ''@openai/agents'';

export default {
  async fetch(request: Request, env: Env) {
    const { message } = await request.json();

    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;

    const agent = new Agent({
      name: ''Assistant'',
      instructions: ''Be helpful and concise'',
      model: ''gpt-4o-mini'',
    });

    const result = await run(agent, message, {
      maxTurns: 5,
    });

    return new Response(JSON.stringify({
      response: result.finalOutput,
      tokens: result.usage.totalTokens,
    }), {
      headers: { ''Content-Type'': ''application/json'' },
    });
  },
};
```

**Limitations**:
- No realtime voice agents
- CPU time limits (30s max)
- Memory constraints (128MB)

**Templates**:
- `templates/cloudflare-workers/worker-text-agent.ts`
- `templates/cloudflare-workers/worker-agent-hono.ts`

**References**:
- `references/cloudflare-integration.md`

### Next.js App Router

```typescript
// app/api/agent/route.ts
import { NextRequest, NextResponse } from ''next/server'';
import { Agent, run } from ''@openai/agents'';

export async function POST(request: NextRequest) {
  const { message } = await request.json();

  const agent = new Agent({
    name: ''Assistant'',
    instructions: ''Be helpful'',
  });

  const result = await run(agent, message);

  return NextResponse.json({
    response: result.finalOutput,
  });
}
```

**Templates**:
- `templates/nextjs/api-agent-route.ts`
- `templates/nextjs/api-realtime-route.ts`

---

## Error Handling (9+ Errors Prevented)

### 1. Zod Schema Type Errors

**Error**: Type errors with tool parameters.

**Workaround**: Define schemas inline.

```typescript
// ❌ Can cause type errors
parameters: mySchema

// ✅ Works reliably
parameters: z.object({ field: z.string() })
```

**Source**: [GitHub #188](https://github.com/openai/openai-agents-js/issues/188)

### 2. MCP Tracing Errors

**Error**: "No existing trace found" with MCP servers.

**Workaround**:
```typescript
import { initializeTracing } from ''@openai/agents/tracing'';
await initializeTracing();
```

**Source**: [GitHub #580](https://github.com/openai/openai-agents-js/issues/580)

### 3. MaxTurnsExceededError

**Error**: Agent loops infinitely.

**Solution**: Increase maxTurns or improve instructions:

```typescript
const result = await run(agent, input, {
  maxTurns: 20, // Increase limit
});

// Or improve instructions
instructions: `After using tools, provide a final answer.
Do not loop endlessly.`
```

### 4. ToolCallError

**Error**: Tool execution fails.

**Solution**: Retry with exponential backoff:

```typescript
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    return await run(agent, input);
  } catch (error) {
    if (error instanceof ToolCallError && attempt < 3) {
      await sleep(1000 * Math.pow(2, attempt - 1));
      continue;
    }
    throw error;
  }
}
```

### 5. Schema Mismatch

**Error**: Output doesn''t match `outputType`.

**Solution**: Use stronger model or add validation instructions:

```typescript
const agent = new Agent({
  model: ''gpt-4o'', // More reliable than gpt-4o-mini
  instructions: ''CRITICAL: Return JSON matching schema exactly'',
  outputType: mySchema,
});
```

**All Errors**: See `references/common-errors.md`

**Template**: `templates/shared/error-handling.ts`

---

## Orchestration Patterns

### LLM-Based

Agent decides routing autonomously:

```typescript
const manager = Agent.create({
  instructions: ''Analyze request and route to appropriate agent'',
  handoffs: [agent1, agent2, agent3],
});
```

**Pros**: Adaptive, handles complexity
**Cons**: Less predictable, higher tokens

### Code-Based

Explicit control flow:

```typescript
const summary = await run(summarizerAgent, text);
const sentiment = await run(sentimentAgent, summary.finalOutput);

if (sentiment.finalOutput.score < 0.3) {
  await run(escalationAgent, text);
}
```

**Pros**: Predictable, lower cost
**Cons**: Less flexible

### Parallel

Run multiple agents concurrently:

```typescript
const [summary, keywords, entities] = await Promise.all([
  run(summarizerAgent, text),
  run(keywordAgent, text),
  run(entityAgent, text),
]);
```

**Template**: `templates/text-agents/agent-parallel.ts`

**References**: `references/agent-patterns.md`

---

## Debugging & Tracing

Enable verbose logging:

```typescript
process.env.DEBUG = ''@openai/agents:*'';
```

Access execution details:

```typescript
const result = await run(agent, input);

console.log(''Tokens:'', result.usage.totalTokens);
console.log(''Turns:'', result.history.length);
console.log(''Current Agent:'', result.currentAgent?.name);
```

**Template**: `templates/shared/tracing-setup.ts`

---

## When to Use This Skill

✅ **Use when**:
- Building multi-agent workflows
- Creating voice AI applications
- Implementing tool-calling patterns
- Requiring input/output validation (guardrails)
- Needing human approval gates
- Orchestrating complex AI tasks
- Deploying to Cloudflare Workers or Next.js

❌ **Don''t use when**:
- Simple OpenAI API calls (use `openai-api` skill instead)
- Non-OpenAI models exclusively
- Production voice at massive scale (consider LiveKit Agents)

---

## Production Checklist

- [ ] Set `OPENAI_API_KEY` as environment secret
- [ ] Implement error handling for all agent calls
- [ ] Add guardrails for safety-critical applications
- [ ] Enable tracing for debugging
- [ ] Set reasonable `maxTurns` to prevent runaway costs
- [ ] Use `gpt-4o-mini` where possible for cost efficiency
- [ ] Implement rate limiting
- [ ] Log token usage for cost monitoring
- [ ] Test handoff flows thoroughly
- [ ] Never expose API keys to browsers (use session tokens)

---

## Token Efficiency

**Estimated Savings**: ~60%

| Task | Without Skill | With Skill | Savings |
|------|---------------|------------|---------|
| Multi-agent setup | ~12k tokens | ~5k tokens | 58% |
| Voice agent | ~10k tokens | ~4k tokens | 60% |
| Error debugging | ~8k tokens | ~3k tokens | 63% |
| **Average** | **~10k** | **~4k** | **~60%** |

**Errors Prevented**: 9 documented issues = 100% error prevention

---

## Templates Index

**Text Agents** (8):
1. `agent-basic.ts` - Simple agent with tools
2. `agent-handoffs.ts` - Multi-agent triage
3. `agent-structured-output.ts` - Zod schemas
4. `agent-streaming.ts` - Real-time events
5. `agent-guardrails-input.ts` - Input validation
6. `agent-guardrails-output.ts` - Output filtering
7. `agent-human-approval.ts` - HITL pattern
8. `agent-parallel.ts` - Concurrent execution

**Realtime Agents** (3):
9. `realtime-agent-basic.ts` - Voice setup
10. `realtime-session-browser.tsx` - React client
11. `realtime-handoffs.ts` - Voice delegation

**Framework Integration** (4):
12. `worker-text-agent.ts` - Cloudflare Workers
13. `worker-agent-hono.ts` - Hono framework
14. `api-agent-route.ts` - Next.js API
15. `api-realtime-route.ts` - Next.js voice

**Utilities** (2):
16. `error-handling.ts` - Comprehensive errors
17. `tracing-setup.ts` - 

<!-- truncated -->' WHERE slug = 'neversight-openai-agents-ill-md';
UPDATE skills SET content = '---
name: zustand-state-management
description: Best practices for Zustand state management in React and Next.js applications with TypeScript.
---

# Zustand State Management

You are an expert in Zustand state management for React and Next.js applications.

## Core Principles

- Use Zustand for lightweight, flexible state management
- Minimize `useEffect` and `setState`; prioritize derived state and memoization
- Implement functional, declarative patterns avoiding classes
- Use descriptive variable names with auxiliary verbs like `isLoading`, `hasError`

## Store Design

### Basic Store Structure
```typescript
import { create } from ''zustand''

interface BearState {
  bears: number
  isLoading: boolean
  hasError: boolean
  increase: () => void
  reset: () => void
}

const useBearStore = create<BearState>((set) => ({
  bears: 0,
  isLoading: false,
  hasError: false,
  increase: () => set((state) => ({ bears: state.bears + 1 })),
  reset: () => set({ bears: 0 }),
}))
```

### Best Practices
- Keep stores focused and modular
- Use selectors to prevent unnecessary re-renders
- Implement middleware for persistence, logging, or devtools
- Separate actions from state when stores grow complex

## Integration with React

- Use shallow equality for selecting multiple values
- Combine with TanStack React Query for server state
- Implement proper TypeScript interfaces for type safety
- Use zustand/middleware for persistence and devtools

## Performance Optimization

- Select only the state you need in components
- Use shallow comparison for object selections
- Avoid selecting the entire store
- Memoize computed values when necessary

## Middleware Usage

### Persistence
```typescript
import { persist } from ''zustand/middleware''

const useStore = create(
  persist(
    (set) => ({
      // state and actions
    }),
    { name: ''store-key'' }
  )
)
```

### DevTools
```typescript
import { devtools } from ''zustand/middleware''

const useStore = create(
  devtools((set) => ({
    // state and actions
  }))
)
```

## Error Handling

- Handle errors at function start using early returns and guard clauses
- Implement error states within stores
- Use try-catch in async actions
- Provide meaningful error messages

## Testing

- Test stores independently of components
- Mock Zustand stores in component tests
- Verify state transitions and actions
- Test middleware behavior separately
' WHERE slug = 'neversight-zustand-state-management';
UPDATE skills SET content = '---
name: react-native-state
description: Master state management - Redux Toolkit, Zustand, TanStack Query, and data persistence
sasmp_version: "1.3.0"
bonded_agent: 03-react-native-state
bond_type: PRIMARY_BOND
version: "2.0.0"
updated: "2025-01"
---

# React Native State Management Skill

> Learn production-ready state management including Redux Toolkit, Zustand, TanStack Query, and persistence with AsyncStorage/MMKV.

## Prerequisites

- React Native basics
- TypeScript fundamentals
- Understanding of React hooks

## Learning Objectives

After completing this skill, you will be able to:
- [ ] Set up Redux Toolkit with TypeScript
- [ ] Create Zustand stores with persistence
- [ ] Manage server state with TanStack Query
- [ ] Persist data with AsyncStorage/MMKV
- [ ] Choose the right solution for each use case

---

## Topics Covered

### 1. Redux Toolkit Setup
```typescript
// store/index.ts
import { configureStore } from ''@reduxjs/toolkit'';
import { authSlice } from ''./slices/authSlice'';

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

### 2. RTK Slice
```typescript
import { createSlice, PayloadAction } from ''@reduxjs/toolkit'';

interface AuthState {
  user: User | null;
  token: string | null;
}

export const authSlice = createSlice({
  name: ''auth'',
  initialState: { user: null, token: null } as AuthState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
    },
  },
});
```

### 3. Zustand Store
```typescript
import { create } from ''zustand'';
import { persist, createJSONStorage } from ''zustand/middleware'';
import AsyncStorage from ''@react-native-async-storage/async-storage'';

interface AppStore {
  theme: ''light'' | ''dark'';
  setTheme: (theme: ''light'' | ''dark'') => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      theme: ''light'',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: ''app-storage'',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

### 4. TanStack Query
```typescript
import { useQuery, useMutation } from ''@tanstack/react-query'';

export function useProducts() {
  return useQuery({
    queryKey: [''products''],
    queryFn: () => api.getProducts(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [''products''] });
    },
  });
}
```

### 5. When to Use What

| Solution | Use Case |
|----------|----------|
| useState/useReducer | Component-local state |
| Zustand | Simple global state, preferences |
| Redux Toolkit | Complex app state, large teams |
| TanStack Query | Server state, caching, sync |
| Context | Theme, auth status (low-frequency) |

---

## Quick Start Example

```typescript
// Zustand + TanStack Query combo
import { create } from ''zustand'';
import { useQuery } from ''@tanstack/react-query'';

// UI state with Zustand
const useUIStore = create((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));

// Server state with TanStack Query
function ProductList() {
  const { data, isLoading } = useQuery({
    queryKey: [''products''],
    queryFn: fetchProducts,
  });

  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  // Render with both states
}
```

---

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Non-serializable value" | Functions in Redux state | Use middleware ignore |
| State not persisting | Wrong storage config | Check persist config |
| Stale data | Missing invalidation | Add proper query keys |

---

## Validation Checklist

- [ ] State updates correctly
- [ ] Persistence works across restarts
- [ ] Server state syncs properly
- [ ] TypeScript types are correct

---

## Usage

```
Skill("react-native-state")
```

**Bonded Agent**: `03-react-native-state`
' WHERE slug = 'neversight-react-native-state';
UPDATE skills SET content = '---
name: react-router-code-review
description: Reviews React Router code for proper data loading, mutations, error handling, and navigation patterns. Use when reviewing React Router v6.4+ code, loaders, actions, or navigation logic.
---

# React Router Code Review

## Quick Reference

| Issue Type | Reference |
|------------|-----------|
| useEffect for data, missing loaders, params | [references/data-loading.md](references/data-loading.md) |
| Form vs useFetcher, action patterns | [references/mutations.md](references/mutations.md) |
| Missing error boundaries, errorElement | [references/error-handling.md](references/error-handling.md) |
| navigate() vs Link, pending states | [references/navigation.md](references/navigation.md) |

## Review Checklist

- [ ] Data loaded via `loader` not `useEffect`
- [ ] Route params accessed type-safely with validation
- [ ] Using `defer()` for parallel data fetching when appropriate
- [ ] Mutations use `<Form>` or `useFetcher` not manual fetch
- [ ] Actions handle both success and error cases
- [ ] Error boundaries with `errorElement` on routes
- [ ] Using `isRouteErrorResponse()` to check error types
- [ ] Navigation uses `<Link>` over `navigate()` where possible
- [ ] Pending states shown via `useNavigation()` or `fetcher.state`
- [ ] No navigation in render (only in effects or handlers)

## Valid Patterns (Do NOT Flag)

These patterns are correct React Router usage - do not report as issues:

- **useEffect for client-only data** - Loaders run server-side; localStorage, window dimensions, and browser APIs must use useEffect
- **navigate() in event handlers** - Link is for declarative navigation; navigate() is correct for imperative navigation in callbacks/handlers
- **Type annotation on loader data** - `useLoaderData<typeof loader>()` is a type annotation, not a type assertion
- **Empty errorElement at route level** - Route may intentionally rely on parent error boundary
- **Form without action prop** - Posts to current URL by convention; explicit action is optional
- **loader returning null** - Valid when data may not exist; null is a legitimate loader return value
- **Using fetcher.data without checking fetcher.state** - May be intentional when stale data is acceptable during revalidation

## Context-Sensitive Rules

Only flag these issues when the specific context applies:

| Issue | Flag ONLY IF |
|-------|--------------|
| Missing loader | Data is available server-side (not client-only) |
| useEffect for data fetching | Data is NOT client-only (localStorage, browser APIs, window size) |
| Missing errorElement | No parent route in the hierarchy has an error boundary |
| navigate() instead of Link | Navigation is NOT triggered by an event handler or conditional logic |

## When to Load References

- Reviewing data fetching code → data-loading.md
- Reviewing forms or mutations → mutations.md
- Reviewing error handling → error-handling.md
- Reviewing navigation logic → navigation.md

## Review Questions

1. Is data loaded in loaders instead of effects?
2. Are mutations using Form/action patterns?
3. Are there error boundaries at appropriate route levels?
4. Is navigation declarative with Link components?
5. Are pending states properly handled?

## Before Submitting Findings

Load and follow [review-verification-protocol](../review-verification-protocol/SKILL.md) before reporting any issue.
' WHERE slug = 'neversight-react-router-code-review';