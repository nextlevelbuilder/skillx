UPDATE skills SET content = '---
name: "moai-domain-frontend"
description: "Frontend development specialist covering React 19, Next.js 16, Vue 3.5, and modern UI/UX patterns with component architecture. Use when building web UIs, implementing components, optimizing frontend performance, or integrating state management."
version: 2.0.0
category: "domain"
modularized: true
user-invocable: false
tags: [''frontend'', ''react'', ''nextjs'', ''vue'', ''ui'', ''components'']
context7-libraries: [''/facebook/react'', ''/vercel/next.js'', ''/vuejs/vue'']
updated: 2026-01-11
allowed-tools:
  - Read
  - Grep
  - Glob
  - mcp__context7__resolve-library-id
  - mcp__context7__get-library-docs
status: "active"
author: "MoAI-ADK Team"
triggers:
  keywords:
    - frontend
    - UI
    - component
    - React
    - Next.js
    - Vue
    - user interface
    - responsive
    - TypeScript
    - JavaScript
    - state management
    - hooks
    - props
    - JSX
    - TSX
    - client-side
    - browser
    - DOM
    - CSS
    - Tailwind
---

# Frontend Development Specialist

## Quick Reference

Modern Frontend Development - Comprehensive patterns for React 19, Next.js 16, Vue 3.5.

Core Capabilities:

- React 19: Server components, concurrent features, cache(), Suspense
- Next.js 16: App Router, Server Actions, ISR, Route handlers
- Vue 3.5: Composition API, TypeScript, Pinia state management
- Component Architecture: Design systems, compound components, CVA
- Performance: Code splitting, dynamic imports, memoization

When to Use:

- Modern web application development
- Component library creation
- Frontend performance optimization
- UI/UX with accessibility

---

## Module Index

Load specific modules for detailed patterns:

### Framework Patterns

React 19 Patterns in modules/react19-patterns.md:

- Server Components, Concurrent features, cache() API, Form handling

Next.js 16 Patterns in modules/nextjs16-patterns.md:

- App Router, Server Actions, ISR, Route Handlers, Parallel Routes

Vue 3.5 Patterns in modules/vue35-patterns.md:

- Composition API, Composables, Reactivity, Pinia, Provide/Inject

### Architecture Patterns

Component Architecture in modules/component-architecture.md:

- Design tokens, CVA variants, Compound components, Accessibility

State Management in modules/state-management.md:

- Zustand, Redux Toolkit, React Context, Pinia

Performance Optimization in modules/performance-optimization.md:

- Code splitting, Dynamic imports, Image optimization, Memoization

Vercel React Best Practices in modules/vercel-react-best-practices.md:

- 45 rules across 8 categories from Vercel Engineering
- Eliminating waterfalls, bundle optimization, server-side performance
- Client-side data fetching, re-render optimization, rendering performance

---

## Implementation Quickstart

### React 19 Server Component

Create an async page component that uses the cache function from React to memoize data fetching. Import Suspense for loading states. Define a getData function that fetches from the API endpoint with an id parameter and returns JSON. In the page component, wrap the DataDisplay component with Suspense using a Skeleton fallback, and pass the awaited getData result as the data prop.

### Next.js Server Action

Create a server action file with the use server directive. Import revalidatePath from next/cache and z from zod for validation. Define a schema with title (minimum 1 character) and content (minimum 10 characters). The createPost function accepts FormData, validates with safeParse, returns errors on failure, creates the post in the database, and calls revalidatePath for the posts page.

### Vue Composable

Create a useUser composable that accepts a userId ref parameter. Define user as a nullable ref, loading as a boolean ref, and fullName as a computed property that concatenates firstName and lastName. Use watchEffect to set loading true, fetch the user data asynchronously, assign to user ref, and set loading false. Return the user, loading, and fullName refs.

### CVA Component

Import cva and VariantProps from class-variance-authority. Define buttonVariants with base classes for inline-flex, items-center, justify-center, rounded-md, and font-medium. Add variants object with variant options for default (primary background with hover) and outline (border with hover accent). Add size options for sm (h-9, px-3, text-sm), default (h-10, px-4), and lg (h-11, px-8). Set defaultVariants for variant and size. Export a Button component that applies the variants to a button element className.

---

## Works Well With

- moai-domain-backend - Full-stack development
- moai-library-shadcn - Component library integration
- moai-domain-uiux - UI/UX design principles
- moai-lang-typescript - TypeScript patterns
- moai-workflow-testing - Frontend testing

---

## Technology Stack

Frameworks: React 19, Next.js 16, Vue 3.5, Nuxt 3

Languages: TypeScript 5.9+, JavaScript ES2024

Styling: Tailwind CSS 3.4+, CSS Modules, shadcn/ui

State: Zustand, Redux Toolkit, Pinia

Testing: Vitest, Testing Library, Playwright

---

## Resources

Module files in the modules directory contain detailed patterns.

For working code examples, see [examples.md](examples.md).

Official documentation:

- React: https://react.dev/
- Next.js: https://nextjs.org/docs
- Vue: https://vuejs.org/

---

Version: 2.0.0
Last Updated: 2026-01-11
' WHERE slug = 'neversight-moai-domain-frontend-ill-md';
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
' WHERE slug = 'neversight-ui-ux-pro-max-ill-md';
UPDATE skills SET content = '---
name: svelte-runes
# IMPORTANT: Keep description on ONE line for Claude Code compatibility
# prettier-ignore
description: Svelte runes guidance. Use for reactive state, props, effects, attachments, or migration. Covers $state, $derived, $effect, @attach. Prevents reactivity mistakes.
---

# Svelte Runes

## Quick Start

**Which rune?** Props: `$props()` | Bindable: `$bindable()` |
Computed: `$derived()` | Side effect: `$effect()` | State: `$state()`

**Key rules:** Runes are top-level only. $derived can be overridden
(use `const` for read-only). Don''t mix Svelte 4/5 syntax.
Objects/arrays are deeply reactive by default.

## Example

```svelte
<script>
	let count = $state(0); // Mutable state
	const doubled = $derived(count * 2); // Computed (const = read-only)

	$effect(() => {
		console.log(`Count is ${count}`); // Side effect
	});
</script>

<button onclick={() => count++}>
	{count} (doubled: {doubled})
</button>
```

## Reference Files

- [reactivity-patterns.md](references/reactivity-patterns.md) - When
  to use each rune
- [migration-gotchas.md](references/migration-gotchas.md) - Svelte 4→5
  translation
- [component-api.md](references/component-api.md) - $props, $bindable
  patterns
- [snippets-vs-slots.md](references/snippets-vs-slots.md) - New
  snippet syntax
- [common-mistakes.md](references/common-mistakes.md) - Anti-patterns
  with fixes
- [attachments.md](references/attachments.md) - @attach replaces use:
  actions

## Notes

- Use `onclick` not `on:click`, `{@render children()}` in layouts
- `$derived` can be reassigned (5.25+) - use `const` for read-only
- **Last verified:** 2025-01-11

<!--
PROGRESSIVE DISCLOSURE GUIDELINES:
- Keep this file ~50 lines total (max ~150 lines)
- Use 1-2 code blocks only (recommend 1)
- Keep description <200 chars for Level 1 efficiency
- Move detailed docs to references/ for Level 3 loading
- This is Level 2 - quick reference ONLY, not a manual

LLM WORKFLOW (when editing this file):
1. Write/edit SKILL.md
2. Format (if formatter available)
3. Run: claude-skills-cli validate <path>
4. If multi-line description warning: run claude-skills-cli doctor <path>
5. Validate again to confirm
-->
' WHERE slug = 'neversight-svelte-runes';
UPDATE skills SET content = '---
name: nextjs
description: Next.js development including App Router, Server Components, API routes, and deployment. Activate for Next.js apps, SSR, SSG, and React Server Components.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Next.js Skill

Provides comprehensive Next.js development capabilities for modern web applications.

## When to Use This Skill

Activate this skill when working with:
- Next.js App Router
- Server Components and Client Components
- API Routes and Server Actions
- Static Site Generation (SSG)
- Server-Side Rendering (SSR)

## Project Structure (App Router)

\`\`\`
app/
├── layout.tsx              # Root layout
├── page.tsx                # Home page
├── loading.tsx             # Loading UI
├── error.tsx               # Error handling
├── not-found.tsx           # 404 page
├── globals.css
├── agents/
│   ├── page.tsx           # /agents
│   ├── [id]/
│   │   ├── page.tsx       # /agents/[id]
│   │   └── edit/
│   │       └── page.tsx   # /agents/[id]/edit
│   └── new/
│       └── page.tsx       # /agents/new
├── api/
│   └── agents/
│       ├── route.ts       # /api/agents
│       └── [id]/
│           └── route.ts   # /api/agents/[id]
└── (dashboard)/           # Route group
    ├── layout.tsx
    └── settings/
        └── page.tsx
\`\`\`

## Server Components (Default)

\`\`\`tsx
// app/agents/page.tsx - Server Component
async function AgentsPage() {
  // Direct database access (no API needed)
  const agents = await db.query(''SELECT * FROM agents'');

  return (
    <div>
      <h1>Agents</h1>
      <ul>
        {agents.map(agent => (
          <li key={agent.id}>{agent.name}</li>
        ))}
      </ul>
    </div>
  );
}

export default AgentsPage;
\`\`\`

## Client Components

\`\`\`tsx
// components/AgentSelector.tsx
''use client'';

import { useState } from ''react'';

export function AgentSelector({ agents }: { agents: Agent[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <select
      value={selected || ''''}
      onChange={(e) => setSelected(e.target.value)}
    >
      <option value="">Select an agent</option>
      {agents.map(agent => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  );
}
\`\`\`

## Data Fetching

### Server Component Data Fetching
\`\`\`tsx
// Automatic request deduplication
async function getAgent(id: string) {
  const res = await fetch(`${process.env.API_URL}/agents/${id}`, {
    cache: ''force-cache'',      // Default: cache forever
    // cache: ''no-store'',      // Never cache
    // next: { revalidate: 60 } // Revalidate every 60s
  });
  return res.json();
}

export default async function AgentPage({ params }: { params: { id: string } }) {
  const agent = await getAgent(params.id);
  return <AgentDetails agent={agent} />;
}
\`\`\`

### Revalidation
\`\`\`tsx
// Time-based revalidation
export const revalidate = 60; // Revalidate every 60 seconds

// On-demand revalidation
import { revalidatePath, revalidateTag } from ''next/cache'';

async function updateAgent(id: string, data: FormData) {
  ''use server'';
  await db.update(''agents'', id, data);
  revalidatePath(''/agents'');
  revalidateTag(''agents'');
}
\`\`\`

## Server Actions

\`\`\`tsx
// app/agents/new/page.tsx
import { redirect } from ''next/navigation'';

async function createAgent(formData: FormData) {
  ''use server'';

  const name = formData.get(''name'') as string;
  const type = formData.get(''type'') as string;

  await db.insert(''agents'', { name, type });

  revalidatePath(''/agents'');
  redirect(''/agents'');
}

export default function NewAgentPage() {
  return (
    <form action={createAgent}>
      <input name="name" placeholder="Agent name" required />
      <select name="type">
        <option value="claude">Claude</option>
        <option value="gpt">GPT</option>
      </select>
      <button type="submit">Create Agent</button>
    </form>
  );
}
\`\`\`

## API Routes

\`\`\`tsx
// app/api/agents/route.ts
import { NextRequest, NextResponse } from ''next/server'';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get(''type'');

  const agents = await db.query(
    ''SELECT * FROM agents WHERE type = $1'',
    [type]
  );

  return NextResponse.json(agents);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const agent = await db.insert(''agents'', body);

  return NextResponse.json(agent, { status: 201 });
}

// app/api/agents/[id]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = await db.query(''SELECT * FROM agents WHERE id = $1'', [params.id]);

  if (!agent) {
    return NextResponse.json({ error: ''Not found'' }, { status: 404 });
  }

  return NextResponse.json(agent);
}
\`\`\`

## Layouts and Loading States

\`\`\`tsx
// app/layout.tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav>Navigation</nav>
        <main>{children}</main>
        <footer>Footer</footer>
      </body>
    </html>
  );
}

// app/agents/loading.tsx
export default function Loading() {
  return <div className="spinner">Loading agents...</div>;
}

// app/agents/error.tsx
''use client'';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
\`\`\`

## Middleware

\`\`\`tsx
// middleware.ts
import { NextResponse } from ''next/server'';
import type { NextRequest } from ''next/server'';

export function middleware(request: NextRequest) {
  // Authentication check
  const token = request.cookies.get(''token'');

  if (!token && request.nextUrl.pathname.startsWith(''/dashboard'')) {
    return NextResponse.redirect(new URL(''/login'', request.url));
  }

  // Add headers
  const response = NextResponse.next();
  response.headers.set(''x-custom-header'', ''value'');

  return response;
}

export const config = {
  matcher: [''/dashboard/:path*'', ''/api/:path*''],
};
\`\`\`

## Environment Variables

\`\`\`bash
# .env.local
DATABASE_URL=postgresql://...
API_URL=http://localhost:8000

# Public (exposed to browser)
NEXT_PUBLIC_APP_URL=http://localhost:3000
\`\`\`

\`\`\`tsx
// Server-only
const dbUrl = process.env.DATABASE_URL;

// Client-accessible
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
\`\`\`

## Build Commands

\`\`\`bash
# Development
npm run dev

# Production build
npm run build
npm start

# Static export
npm run build
# next.config.js: output: ''export''
\`\`\`
' WHERE slug = 'neversight-nextjs-ill-md';
UPDATE skills SET content = '---
name: ai-sdk-elements
description: |
  Build AI chat interfaces with AI SDK Elements - React components for chatbots.
  Use when: implementing chat UIs, adding AI reasoning displays, tool confirmations,
  message components, or any AI-native interface. Built on shadcn/ui.
---

# AI SDK Elements

## Overview

AI SDK Elements is a React component library built on **shadcn/ui** for AI-native applications. Part of Vercel''s AI SDK ecosystem.

**Requirements:**
- React 19 (no forwardRef patterns)
- Tailwind CSS 4
- shadcn/ui configured

**Docs:** https://ai-sdk.dev/elements

## Quick Reference

```bash
# Install all components
npx ai-elements@latest

# Install specific component
npx ai-elements@latest add conversation
npx ai-elements@latest add message
npx ai-elements@latest add reasoning

# Alternative (shadcn CLI)
npx shadcn@latest add @ai-elements/conversation
```

Components install to `@/components/ai-elements/`

---

## Core Components

### Conversation (Chat Container)

Main wrapper with auto-scroll to bottom.

```tsx
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from ''@/components/ai-elements/conversation'';

<Conversation className="relative h-full">
  <ConversationContent>
    {messages.length === 0 ? (
      <ConversationEmptyState
        icon={<MessageSquareIcon />}
        title="Start a conversation"
        description="Ask me anything"
      />
    ) : (
      messages.map((msg) => (
        <Message key={msg.id} from={msg.role}>
          <MessageContent>{msg.content}</MessageContent>
        </Message>
      ))
    )}
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>
```

### Message

Individual chat message display.

```tsx
import { Message, MessageContent } from ''@/components/ai-elements/message'';

<Message from="user">
  <MessageContent>Hello, can you help me?</MessageContent>
</Message>

<Message from="assistant">
  <MessageContent>{response}</MessageContent>
</Message>
```

### Prompt Input

User input for chat.

```tsx
import { PromptInput } from ''@/components/ai-elements/prompt-input'';

<PromptInput
  value={input}
  onChange={(e) => setInput(e.target.value)}
  onSubmit={handleSubmit}
  placeholder="Type a message..."
/>
```

---

## AI Reasoning Components

### Reasoning (Collapsible Thinking)

Auto-opens during streaming, collapses when done.

```tsx
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from ''@/components/ai-elements/reasoning'';

<Reasoning isStreaming={isStreaming} className="w-full">
  <ReasoningTrigger title="Thinking..." />
  <ReasoningContent>{reasoningText}</ReasoningContent>
</Reasoning>
```

### Chain of Thought

Visual step-by-step reasoning with search results, images, progress.

```tsx
import { ChainOfThought } from ''@/components/ai-elements/chain-of-thought'';

<ChainOfThought>
  <ChainOfThoughtStep>
    <ChainOfThoughtIcon><SearchIcon /></ChainOfThoughtIcon>
    <ChainOfThoughtContent>
      Searching for profiles...
      <ChainOfThoughtLinks>
        <ChainOfThoughtLink href="https://x.com">x.com</ChainOfThoughtLink>
        <ChainOfThoughtLink href="https://github.com">github.com</ChainOfThoughtLink>
      </ChainOfThoughtLinks>
    </ChainOfThoughtContent>
  </ChainOfThoughtStep>
</ChainOfThought>
```

### Plan & Task

Display agent plans and individual tasks.

```tsx
import { Plan, Task } from ''@/components/ai-elements/plan'';

<Plan title="Implementation Plan">
  <Task status="completed">Set up project structure</Task>
  <Task status="in_progress">Implement core features</Task>
  <Task status="pending">Write tests</Task>
</Plan>
```

---

## Interactivity Components

### Confirmation (Tool Approval)

Manage tool execution approval workflows.

```tsx
import {
  Confirmation,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from ''@/components/ai-elements/confirmation'';

<Confirmation approval={tool.approval} state={tool.state}>
  <ConfirmationRequest>
    This tool wants to delete: <code>{tool.input?.filePath}</code>
    <br />Do you approve?
  </ConfirmationRequest>
  <ConfirmationAccepted>File deleted successfully</ConfirmationAccepted>
  <ConfirmationRejected>Action cancelled</ConfirmationRejected>
  <ConfirmationActions>
    <ConfirmationAction
      onClick={() => respondToConfirmationRequest({ approvalId, approved: false })}>
      Reject
    </ConfirmationAction>
    <ConfirmationAction
      onClick={() => respondToConfirmationRequest({ approvalId, approved: true })}>
      Approve
    </ConfirmationAction>
  </ConfirmationActions>
</Confirmation>
```

### Suggestion (Quick Prompts)

Horizontal row of clickable suggestions.

```tsx
import { Suggestions, Suggestion } from ''@/components/ai-elements/suggestion'';

const prompts = [
  ''How do I get started?'',
  ''What can you help with?'',
  ''Show me examples'',
];

<Suggestions>
  {prompts.map((prompt) => (
    <Suggestion
      key={prompt}
      suggestion={prompt}
      onClick={(text) => setInput(text)}
    />
  ))}
</Suggestions>
```

### Tool

Display tool calls and results.

```tsx
import { Tool, ToolContent, ToolResult } from ''@/components/ai-elements/tool'';

<Tool name="search_web">
  <ToolContent>
    Searching for: {tool.args.query}
  </ToolContent>
  <ToolResult>
    {tool.result}
  </ToolResult>
</Tool>
```

### Checkpoint (Restore Points)

Mark and restore conversation history.

```tsx
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from ''@/components/ai-elements/checkpoint'';

<Checkpoint>
  <CheckpointIcon />
  <CheckpointTrigger onClick={() => restoreToCheckpoint(index)}>
    Restore to this point
  </CheckpointTrigger>
</Checkpoint>
```

---

## Citation Components

### Sources

Collapsible source citations.

```tsx
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from ''@/components/ai-elements/sources'';

<Sources>
  <SourcesTrigger count={3} />
  <SourcesContent>
    <Source href="https://docs.example.com/api" title="API Documentation" />
    <Source href="https://example.com/guide" title="Getting Started Guide" />
    <Source href="https://example.com/faq" title="FAQ" />
  </SourcesContent>
</Sources>
```

### Inline Citation

Citations within text content.

```tsx
import { InlineCitation } from ''@/components/ai-elements/inline-citation'';

<p>
  According to the documentation
  <InlineCitation href="https://docs.example.com" index={1} />
  , you should...
</p>
```

---

## Loading Components

### Queue

Message queue/loading state.

```tsx
import { Queue } from ''@/components/ai-elements/queue'';

<Queue>Processing your request...</Queue>
```

### Shimmer

Skeleton loading placeholder.

```tsx
import { Shimmer } from ''@/components/ai-elements/shimmer'';

{isLoading && <Shimmer className="h-20 w-full" />}
```

---

## Utility Components

### Model Selector

Switch between AI models.

```tsx
import { ModelSelector } from ''@/components/ai-elements/model-selector'';

<ModelSelector
  models={[''gpt-4'', ''claude-3'', ''gemini-pro'']}
  selected={model}
  onSelect={setModel}
/>
```

### Context

Display context information.

```tsx
import { Context } from ''@/components/ai-elements/context'';

<Context title="Current Context">
  Working on: Project Alpha
  Files: 3 selected
</Context>
```

---

## Complete Chat Example

```tsx
''use client'';

import { useState } from ''react'';
import { useChat } from ''ai/react'';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from ''@/components/ai-elements/conversation'';
import { Message, MessageContent } from ''@/components/ai-elements/message'';
import { PromptInput } from ''@/components/ai-elements/prompt-input'';
import { Reasoning, ReasoningTrigger, ReasoningContent } from ''@/components/ai-elements/reasoning'';
import { Suggestions, Suggestion } from ''@/components/ai-elements/suggestion'';
import { Sources, SourcesTrigger, SourcesContent, Source } from ''@/components/ai-elements/sources'';

export function Chat() {
  const { messages, input, setInput, handleSubmit, isLoading } = useChat();

  const suggestions = [
    ''What can you help me with?'',
    ''Tell me about AI SDK'',
    ''How do I get started?'',
  ];

  return (
    <div className="flex h-screen flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="p-4">
          {messages.length === 0 ? (
            <>
              <ConversationEmptyState
                title="Welcome!"
                description="Ask me anything to get started"
              />
              <Suggestions className="mt-4">
                {suggestions.map((s) => (
                  <Suggestion key={s} suggestion={s} onClick={setInput} />
                ))}
              </Suggestions>
            </>
          ) : (
            messages.map((msg) => (
              <Message key={msg.id} from={msg.role}>
                <MessageContent>{msg.content}</MessageContent>

                {/* Show reasoning if available */}
                {msg.reasoning && (
                  <Reasoning isStreaming={isLoading && msg.id === messages.at(-1)?.id}>
                    <ReasoningTrigger />
                    <ReasoningContent>{msg.reasoning}</ReasoningContent>
                  </Reasoning>
                )}

                {/* Show sources if available */}
                {msg.sources?.length > 0 && (
                  <Sources>
                    <SourcesTrigger count={msg.sources.length} />
                    <SourcesContent>
                      {msg.sources.map((src, i) => (
                        <Source key={i} href={src.url} title={src.title} />
                      ))}
                    </SourcesContent>
                  </Sources>
                )}
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <form onSubmit={handleSubmit} className="border-t p-4">
        <PromptInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
```

---

## Styling

All components accept `className` prop for Tailwind customization:

```tsx
<Message className="bg-muted/50 rounded-lg p-4">
  <MessageContent className="text-sm">{content}</MessageContent>
</Message>

<Reasoning className="border-l-2 border-blue-500 pl-4">
  <ReasoningTrigger className="text-blue-600" />
  <ReasoningContent className="text-muted-foreground" />
</Reasoning>
```

---

## Integration with AI SDK

These components work seamlessly with Vercel AI SDK hooks:

```tsx
import { useChat } from ''ai/react'';
import { useCompletion } from ''ai/react'';
import { useAssistant } from ''ai/react'';

// useChat for conversational interfaces
const { messages, input, handleSubmit } = useChat();

// useCompletion for single completions
const { completion, complete } = useCompletion();

// useAssistant for OpenAI Assistants
const { messages, submitMessage } = useAssistant();
```

---

## Reference

See `references/component-api.md` for complete props documentation.
' WHERE slug = 'neversight-ai-sdk-elements';
UPDATE skills SET content = '---
name: e2e-testing
description: >-
  End-to-end testing patterns with Playwright for full-stack Python/React applications.
  Use when writing E2E tests for complete user workflows (login, CRUD, navigation),
  critical path regression tests, or cross-browser validation. Covers test structure,
  page object model, selector strategy (data-testid > role > label), wait strategies,
  auth state reuse, test data management, and CI integration. Does NOT cover unit tests
  or component tests (use pytest-patterns or react-testing-patterns).
license: MIT
compatibility: ''Playwright 1.40+, Node.js 20+''
metadata:
  author: platform-team
  version: ''1.0.0''
  sdlc-phase: testing
allowed-tools: Read Edit Write Bash(npx:*) Bash(npm:*)
context: fork
---

# E2E Testing

## When to Use

Activate this skill when:
- Writing E2E tests for complete user workflows (login, CRUD operations, multi-page flows)
- Creating critical path regression tests that validate the full stack
- Testing cross-browser compatibility (Chromium, Firefox, WebKit)
- Validating authentication flows end-to-end
- Testing file upload/download workflows
- Writing smoke tests for deployment verification

Do NOT use this skill for:
- React component unit tests (use `react-testing-patterns`)
- Python backend unit/integration tests (use `pytest-patterns`)
- TDD workflow enforcement (use `tdd-workflow`)
- API contract testing without a browser (use `pytest-patterns` with httpx)

## Instructions

### Test Structure

```
e2e/
├── playwright.config.ts         # Global Playwright configuration
├── fixtures/
│   ├── auth.fixture.ts          # Authentication state setup
│   └── test-data.fixture.ts     # Test data creation/cleanup
├── pages/
│   ├── base.page.ts             # Base page object with shared methods
│   ├── login.page.ts            # Login page object
│   ├── users.page.ts            # Users list page object
│   └── user-detail.page.ts     # User detail page object
├── tests/
│   ├── auth/
│   │   ├── login.spec.ts
│   │   └── logout.spec.ts
│   ├── users/
│   │   ├── create-user.spec.ts
│   │   ├── edit-user.spec.ts
│   │   └── list-users.spec.ts
│   └── smoke/
│       └── critical-paths.spec.ts
└── utils/
    ├── api-helpers.ts           # Direct API calls for test setup
    └── test-constants.ts        # Shared constants
```

**Naming conventions:**
- Test files: `<feature>.spec.ts`
- Page objects: `<page-name>.page.ts`
- Fixtures: `<concern>.fixture.ts`
- Test names: human-readable sentences describing the user action and expected outcome

### Page Object Model

Every page gets a page object class that encapsulates selectors and actions. Tests never interact with selectors directly.

**Base page object:**
```typescript
// e2e/pages/base.page.ts
import { type Page, type Locator } from "@playwright/test";

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** Navigate to the page''s URL. */
  abstract goto(): Promise<void>;

  /** Wait for the page to be fully loaded. */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState("networkidle");
  }

  /** Get a toast/notification message. */
  get toast(): Locator {
    return this.page.getByRole("alert");
  }

  /** Get the page heading. */
  get heading(): Locator {
    return this.page.getByRole("heading", { level: 1 });
  }
}
```

**Concrete page object:**
```typescript
// e2e/pages/users.page.ts
import { type Page, type Locator } from "@playwright/test";
import { BasePage } from "./base.page";

export class UsersPage extends BasePage {
  // ─── Locators ─────────────────────────────────────────
  readonly createButton: Locator;
  readonly searchInput: Locator;
  readonly userTable: Locator;

  constructor(page: Page) {
    super(page);
    this.createButton = page.getByTestId("create-user-btn");
    this.searchInput = page.getByRole("searchbox", { name: /search users/i });
    this.userTable = page.getByRole("table");
  }

  // ─── Actions ──────────────────────────────────────────
  async goto(): Promise<void> {
    await this.page.goto("/users");
    await this.waitForLoad();
  }

  async searchFor(query: string): Promise<void> {
    await this.searchInput.fill(query);
    // Wait for search results to update (debounced)
    await this.page.waitForResponse("**/api/v1/users?*");
  }

  async clickCreateUser(): Promise<void> {
    await this.createButton.click();
  }

  async getUserRow(email: string): Promise<Locator> {
    return this.userTable.getByRole("row").filter({ hasText: email });
  }

  async getUserCount(): Promise<number> {
    // Subtract 1 for header row
    return (await this.userTable.getByRole("row").count()) - 1;
  }
}
```

**Rules for page objects:**
- One page object per page or major UI section
- Locators are public readonly properties
- Actions are async methods
- Page objects never contain assertions -- tests assert
- Page objects handle waits internally after actions

### Selector Strategy

**Priority order (highest to lowest):**

| Priority | Selector | Example | When to Use |
|----------|----------|---------|-------------|
| 1 | `data-testid` | `getByTestId("submit-btn")` | Interactive elements, dynamic content |
| 2 | Role | `getByRole("button", { name: /save/i })` | Buttons, links, headings, inputs |
| 3 | Label | `getByLabel("Email")` | Form inputs with labels |
| 4 | Placeholder | `getByPlaceholder("Search...")` | Search inputs |
| 5 | Text | `getByText("Welcome back")` | Static text content |

**NEVER use:**
- CSS selectors (`.class-name`, `#id`) -- brittle, break on styling changes
- XPath (`//div[@class="foo"]`) -- unreadable, extremely brittle
- DOM structure selectors (`div > span:nth-child(2)`) -- break on layout changes

**Adding data-testid attributes:**
```tsx
// In React components -- add data-testid to interactive elements
<button data-testid="create-user-btn" onClick={handleCreate}>
  Create User
</button>

// Convention: kebab-case, descriptive
// Pattern: <action>-<entity>-<element-type>
// Examples: create-user-btn, user-email-input, delete-confirm-dialog
```

### Wait Strategies

**NEVER use hardcoded waits:**
```typescript
// BAD: Hardcoded wait -- flaky, slow
await page.waitForTimeout(3000);

// BAD: Sleep
await new Promise((resolve) => setTimeout(resolve, 2000));
```

**Use explicit wait conditions:**
```typescript
// GOOD: Wait for a specific element to appear
await page.getByRole("heading", { name: "Dashboard" }).waitFor();

// GOOD: Wait for navigation
await page.waitForURL("/dashboard");

// GOOD: Wait for API response
await page.waitForResponse(
  (response) =>
    response.url().includes("/api/v1/users") && response.status() === 200,
);

// GOOD: Wait for network to settle
await page.waitForLoadState("networkidle");

// GOOD: Wait for element state
await page.getByTestId("submit-btn").waitFor({ state: "visible" });
await page.getByTestId("loading-spinner").waitFor({ state: "hidden" });
```

**Auto-waiting:** Playwright auto-waits for elements to be actionable before clicking, filling, etc. Explicit waits are needed only for assertions or complex state transitions.

### Auth State Reuse

Avoid logging in before every test. Save auth state and reuse it.

**Setup auth state once:**
```typescript
// e2e/fixtures/auth.fixture.ts
import { test as base } from "@playwright/test";
import path from "path";

const AUTH_STATE_PATH = path.resolve("e2e/.auth/user.json");

export const setup = base.extend({});

setup("authenticate", async ({ page }) => {
  // Perform real login
  await page.goto("/login");
  await page.getByLabel("Email").fill("testuser@example.com");
  await page.getByLabel("Password").fill("TestPassword123!");
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for auth to complete
  await page.waitForURL("/dashboard");

  // Save signed-in state
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
```

**Reuse in tests:**
```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    // Setup project runs first and saves auth state
    { name: "setup", testDir: "./e2e/fixtures", testMatch: "auth.fixture.ts" },
    {
      name: "chromium",
      use: {
        storageState: "e2e/.auth/user.json",  // Reuse auth state
      },
      dependencies: ["setup"],
    },
  ],
});
```

### Test Data Management

**Principles:**
- Tests create their own data (never depend on pre-existing data)
- Tests clean up after themselves (or use API to reset)
- Use API calls for setup, not UI interactions (faster, more reliable)

**API helpers for test data:**
```typescript
// e2e/utils/api-helpers.ts
import { type APIRequestContext } from "@playwright/test";

export class TestDataAPI {
  constructor(private request: APIRequestContext) {}

  async createUser(data: { email: string; displayName: string }) {
    const response = await this.request.post("/api/v1/users", { data });
    return response.json();
  }

  async deleteUser(userId: number) {
    await this.request.delete(`/api/v1/users/${userId}`);
  }

  async createOrder(userId: number, items: Array<Record<string, unknown>>) {
    const response = await this.request.post("/api/v1/orders", {
      data: { user_id: userId, items },
    });
    return response.json();
  }
}
```

**Usage in tests:**
```typescript
test("edit user name", async ({ page, request }) => {
  const api = new TestDataAPI(request);

  // Setup: create user via API (fast)
  const user = await api.createUser({
    email: "edit-test@example.com",
    displayName: "Before Edit",
  });

  try {
    // Test: edit via UI
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    // ... perform edit via UI ...
  } finally {
    // Cleanup: remove test data
    await api.deleteUser(user.id);
  }
});
```

### Debugging Flaky Tests

**1. Use trace viewer for failures:**
```typescript
// playwright.config.ts
use: {
  trace: "on-first-retry",  // Capture trace only on retry
}
```

View trace: `npx playwright show-trace trace.zip`

**2. Run in headed mode for debugging:**
```bash
npx playwright test --headed --debug tests/users/create-user.spec.ts
```

**3. Common causes of flaky tests:**
| Cause | Fix |
|-------|-----|
| Hardcoded waits | Use explicit wait conditions |
| Shared test data | Each test creates its own data |
| Animation interference | Set `animations: "disabled"` in config |
| Race conditions | Wait for API responses before assertions |
| Viewport-dependent behavior | Set explicit viewport in config |
| Session leaks between tests | Use `storageState` correctly, clear cookies |

**4. Retry strategy:**
```typescript
// playwright.config.ts
export default defineConfig({
  retries: process.env.CI ? 2 : 0,  // Retry in CI only
});
```

### CI Configuration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Start application
        run: |
          docker compose up -d
          npx wait-on http://localhost:3000 --timeout 60000

      - name: Run E2E tests
        run: npx playwright test

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14

      - name: Upload traces on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-traces
          path: test-results/
```

Use `scripts/run-e2e-with-report.sh` to run Playwright with HTML report output locally.

## Examples

See `references/page-object-template.ts` for annotated page object class.
See `references/e2e-test-template.ts` for annotated E2E test.
See `references/playwright-config-example.ts` for production Playwright config.
' WHERE slug = 'neversight-e2e-testing';
UPDATE skills SET content = '---
name: styling-with-shadcn
description: |
  Build beautiful, accessible UIs with shadcn/ui components in Next.js. Use when creating
  forms, dialogs, tables, sidebars, or any UI components. Covers installation, component
  patterns, react-hook-form + Zod validation, and dark mode setup.
  NOT when building non-React applications or using different component libraries.
---

# shadcn/ui

Build beautiful, accessible UIs with copy-paste components built on Radix UI and Tailwind CSS.

## Quick Start

```bash
# Initialize shadcn/ui in your Next.js project
npx shadcn@latest init

# Add components as needed
npx shadcn@latest add button form dialog table sidebar
```

## Common Component Install

```bash
npx shadcn@latest add button card form input label dialog \
  table badge sidebar dropdown-menu avatar separator \
  select textarea tabs toast sonner
```

---

## Core Patterns

### 1. Button Variants

```tsx
import { Button } from "@/components/ui/button"

<Button variant="default">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>

// Sizes: sm, default, lg, icon
<Button size="icon"><Plus /></Button>

// Loading state
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Loading...
</Button>

// As Next.js Link
<Button asChild>
  <Link href="/dashboard">Go to Dashboard</Link>
</Button>
```

### 2. Forms with react-hook-form + Zod

```tsx
"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"

const schema = z.object({
  title: z.string().min(1, "Required"),
  priority: z.enum(["low", "medium", "high"]),
})

export function TaskForm({ onSubmit }) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title: "", priority: "medium" },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  )
}
```

See [references/component-examples.md](references/component-examples.md) for complete form with Select, Textarea.

### 3. Dialog / Modal

```tsx
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog"

<Dialog>
  <DialogTrigger asChild>
    <Button>Create Task</Button>
  </DialogTrigger>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Create New Task</DialogTitle>
      <DialogDescription>Add a new task to your project.</DialogDescription>
    </DialogHeader>
    <TaskForm onSubmit={handleSubmit} />
  </DialogContent>
</Dialog>

// Controlled dialog
const [open, setOpen] = useState(false)
<Dialog open={open} onOpenChange={setOpen}>...</Dialog>
```

### 4. Alert Dialog (Confirmation)

```tsx
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog"

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 5. Data Table (TanStack)

```tsx
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const columns: ColumnDef<Task>[] = [
  { accessorKey: "title", header: "Title" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <Badge>{row.getValue("status")}</Badge>,
  },
]

const table = useReactTable({
  data,
  columns,
  getCoreRowModel: getCoreRowModel(),
})
```

See [references/component-examples.md](references/component-examples.md) for full DataTable with sorting/pagination.

### 6. Card Component

```tsx
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

<Card>
  <CardHeader>
    <CardTitle>{task.title}</CardTitle>
    <CardDescription>Assigned to {task.assignee}</CardDescription>
  </CardHeader>
  <CardContent>
    <p>{task.description}</p>
  </CardContent>
  <CardFooter>
    <Button>Start</Button>
  </CardFooter>
</Card>
```

### 7. Toast Notifications (Sonner)

```tsx
// Add Toaster to layout
import { Toaster } from "@/components/ui/sonner"
<Toaster />

// Use in components
import { toast } from "sonner"

toast.success("Task created")
toast.error("Failed to create task")
toast("Task Updated", { description: "Status changed to in progress" })
toast.promise(createTask(data), {
  loading: "Creating...",
  success: "Created!",
  error: "Failed",
})
```

### 8. Sidebar Navigation

```tsx
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger
} from "@/components/ui/sidebar"

<SidebarProvider>
  <Sidebar>
    <SidebarContent>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild>
              <a href={item.url}><item.icon />{item.title}</a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarContent>
  </Sidebar>
  <main><SidebarTrigger />{children}</main>
</SidebarProvider>
```

See [references/component-examples.md](references/component-examples.md) for full sidebar with persistent state.

### 9. Dark Mode

```tsx
// npm install next-themes

// components/theme-provider.tsx
"use client"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({ children, ...props }) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}

// layout.tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</ThemeProvider>

// Theme toggle
import { useTheme } from "next-themes"
const { setTheme } = useTheme()
setTheme("dark") // or "light" or "system"
```

---

## Dependencies

```json
{
  "dependencies": {
    "@hookform/resolvers": "^3.x",
    "@radix-ui/react-*": "latest",
    "@tanstack/react-table": "^8.x",
    "class-variance-authority": "^0.7.x",
    "clsx": "^2.x",
    "lucide-react": "^0.x",
    "next-themes": "^0.4.x",
    "react-hook-form": "^7.x",
    "sonner": "^1.x",
    "tailwind-merge": "^2.x",
    "zod": "^3.x"
  }
}
```

---

## Verification

Run: `python3 scripts/verify.py`

Expected: `✓ styling-with-shadcn skill ready`

## If Verification Fails

1. Check: references/ folder exists with component-examples.md
2. **Stop and report** if still failing

## Related Skills

- **fetching-library-docs** - Latest shadcn/ui docs: `--library-id /shadcn-ui/ui --topic components`
- **building-nextjs-apps** - Next.js 16 patterns for app structure

## References

- [references/component-examples.md](references/component-examples.md) - Full code examples
- [references/taskflow-theme.md](references/taskflow-theme.md) - Custom theme configuration
' WHERE slug = 'neversight-styling-with-shadcn';
UPDATE skills SET content = '---
name: workos-authkit-react
description: Integrate WorkOS AuthKit with React single-page applications. Client-side only authentication. Use when the project is a React SPA without Next.js or React Router.
---

# WorkOS AuthKit for React (SPA)

## Decision Tree

```
START
  │
  ├─► Fetch README (BLOCKING)
  │   github.com/workos/authkit-react/blob/main/README.md
  │   README is source of truth. Stop if fetch fails.
  │
  ├─► Detect Build Tool
  │   ├─ vite.config.ts exists? → Vite
  │   └─ otherwise → Create React App
  │
  ├─► Set Env Var Prefix
  │   ├─ Vite → VITE_WORKOS_CLIENT_ID
  │   └─ CRA  → REACT_APP_WORKOS_CLIENT_ID
  │
  └─► Implement per README
```

## Critical: Build Tool Detection

| Marker File               | Build Tool | Env Prefix   | Access Pattern            |
| ------------------------- | ---------- | ------------ | ------------------------- |
| `vite.config.ts`          | Vite       | `VITE_`      | `import.meta.env.VITE_*`  |
| `craco.config.js` or none | CRA        | `REACT_APP_` | `process.env.REACT_APP_*` |

**Wrong prefix = undefined values at runtime.** This is the #1 integration failure.

## Key Clarification: No Callback Route

The React SDK handles OAuth callbacks **internally** via AuthKitProvider.

- No server-side callback route needed
- SDK intercepts redirect URI client-side
- Token exchange happens automatically

Just ensure redirect URI env var matches WorkOS Dashboard exactly.

## Required Environment Variables

```
{PREFIX}WORKOS_CLIENT_ID=client_...
{PREFIX}WORKOS_REDIRECT_URI=http://localhost:5173/callback
```

No `WORKOS_API_KEY` needed. Client-side only SDK.

## Verification Checklist

- [ ] README fetched and read
- [ ] Build tool detected correctly
- [ ] Env var prefix matches build tool
- [ ] `.env` or `.env.local` has required vars
- [ ] No `next` dependency (wrong skill)
- [ ] No `react-router` dependency (wrong skill)
- [ ] AuthKitProvider wraps app root
- [ ] `pnpm build` exits 0

## Error Recovery

### "clientId is required"

**Cause:** Env var inaccessible (wrong prefix)

Check: Does prefix match build tool? Vite needs `VITE_`, CRA needs `REACT_APP_`.

### Auth state lost on refresh

**Cause:** Token persistence issue

Check: Browser dev tools → Application → Local Storage. SDK stores tokens here automatically.

### useAuth returns undefined

**Cause:** Component outside provider tree

Check: Entry file (`main.tsx` or `index.tsx`) wraps `<App />` in `<AuthKitProvider>`.

### Callback redirect fails

**Cause:** URI mismatch

Check: Env var redirect URI exactly matches WorkOS Dashboard → Redirects configuration.
' WHERE slug = 'neversight-workos-authkit-react';
UPDATE skills SET content = '---
name: busirocket-typescript-react-standards
description:
  TypeScript and React standards for maintainable codebases. Use when creating
  or refactoring TS/TSX to enforce one-thing-per-file, type conventions, and
  Next.js special-file export exceptions.
metadata:
  author: cristiandeluxe
  version: "1.0.0"
---

# TypeScript + React Standards

Strict, reusable standards for TypeScript/React projects.

## When to Use

Use this skill when:

- Writing or refactoring `.ts` / `.tsx`
- Moving inline types into `types/`
- Enforcing consistent type naming and result shapes
- Working in Next.js where special files allow extra exports

## Non-Negotiables (MUST)

- **One exported symbol per file** for your own modules.
- **No inline `interface`/`type`** in components/hooks/utils/services/route
  handlers.
- Put shared shapes under `types/<area>/...` (**one type per file**).
- Avoid barrel files (`index.ts`) that hide dependencies.
- After meaningful changes: run the project''s standard checks (e.g.
  `yarn check:all`).

## Next.js Special-file Exceptions

- `app/**/page.tsx`, `app/**/layout.tsx`: allow `default export` +
  `metadata/generateMetadata/viewport` (etc.).
- `app/api/**/route.ts`: allow multiple HTTP method exports and route config
  exports.

## Rules

### TypeScript Standards

- `ts-language-style` - Language & style (interface vs type, const vs let,
  English-only)
- `ts-one-thing-per-file` - One thing per file (STRICT)
- `ts-nextjs-exceptions` - Next.js special-file exceptions
- `ts-types-strict` - Types (STRICT) - no inline types
- `ts-helpers-strict` - Helpers (STRICT) - no helpers in components/hooks
- `ts-nextjs-hygiene` - Next.js TS hygiene (docs-aligned)
- `ts-validation` - Validation (run checks after changes)

### Types Conventions

- `types-one-type-per-file` - One type per file (STRICT)
- `types-naming-patterns` - Naming patterns (Params, Result, Error, Props)
- `types-result-shape` - Result shape for boundaries that can fail
- `types-where-allowed` - Where types are allowed

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/ts-one-thing-per-file.md
rules/ts-types-strict.md
rules/types-one-type-per-file.md
```

Each rule file contains:

- Brief explanation of why it matters
- Code examples (correct and incorrect patterns)
- Additional context and best practices
' WHERE slug = 'neversight-busirocket-typescript-react-standards';
UPDATE skills SET content = '---
name: Design to Code
description: This skill should be used when the user asks to "코드 변환", "React 생성", "Tailwind 코드", "컴포넌트 코드", "디자인을 코드로", ".pen 파일에서 코드", or wants to convert Pencil designs into React + Tailwind CSS code.
version: 0.1.0
---

# Design to Code

Pencil .pen 파일의 디자인을 React + Tailwind CSS 코드로 변환하는 가이드라인을 제공한다.

## Conversion Workflow

### 1. 디자인 분석

대상 노드의 구조를 파악한다:

```
mcp__pencil__batch_get(
  filePath: "design.pen",
  nodeIds: ["targetNodeId"],
  readDepth: 5,
  resolveInstances: true,
  resolveVariables: true
)
```

`resolveInstances: true`로 컴포넌트 인스턴스를 풀어서 확인하고, `resolveVariables: true`로 변수값을 실제 값으로 확인한다.

### 2. 변수 추출

디자인 토큰을 Tailwind 설정으로 변환한다:

```
mcp__pencil__get_variables(filePath: "design.pen")
```

### 3. 코드 생성

노드 타입에 따라 적절한 React 컴포넌트로 변환한다.

### 4. 스크린샷 비교

생성된 코드를 시각적으로 검증한다.

## Node to Component Mapping

| Pencil Node | React/HTML | Tailwind Classes |
|-------------|------------|------------------|
| frame (layout: vertical) | `<div>` | `flex flex-col` |
| frame (layout: horizontal) | `<div>` | `flex flex-row` |
| frame (layout: grid) | `<div>` | `grid grid-cols-N` |
| text | `<p>`, `<span>`, `<h1-6>` | `text-*`, `font-*` |
| rectangle | `<div>` | `rounded-*`, `bg-*` |
| ref (Button) | `<button>` or `<Button>` | 컴포넌트별 |

## Property to Tailwind Mapping

### Layout

| Pencil Property | Tailwind |
|-----------------|----------|
| `layout: "horizontal"` | `flex flex-row` |
| `layout: "vertical"` | `flex flex-col` |
| `layout: "grid"` | `grid` |
| `gap: 16` | `gap-4` |
| `padding: 16` | `p-4` |
| `padding: [16, 24, 16, 24]` | `py-4 px-6` |
| `alignItems: "center"` | `items-center` |
| `justifyContent: "center"` | `justify-center` |
| `justifyContent: "space-between"` | `justify-between` |

### Sizing

| Pencil Property | Tailwind |
|-----------------|----------|
| `width: "fill_container"` | `w-full` |
| `height: "fill_container"` | `h-full` |
| `width: "hug_contents"` | `w-fit` |
| `width: 320` | `w-80` or `w-[320px]` |

### Typography

| Pencil Property | Tailwind |
|-----------------|----------|
| `fontSize: 16` | `text-base` |
| `fontSize: 24` | `text-2xl` |
| `fontWeight: "bold"` | `font-bold` |
| `fontWeight: "semibold"` | `font-semibold` |
| `textAlign: "center"` | `text-center` |
| `textColor: "#3B82F6"` | `text-blue-500` |

### Colors

| Pencil Color | Tailwind |
|--------------|----------|
| `#3B82F6` | `blue-500` |
| `#EF4444` | `red-500` |
| `#22C55E` | `green-500` |
| `#F8FAFC` | `slate-50` |
| `#0F172A` | `slate-900` |

### Border Radius

| Pencil Property | Tailwind |
|-----------------|----------|
| `cornerRadius: 4` | `rounded-sm` |
| `cornerRadius: 8` | `rounded-lg` |
| `cornerRadius: 12` | `rounded-xl` |
| `cornerRadius: 9999` | `rounded-full` |

### Effects

| Pencil Property | Tailwind |
|-----------------|----------|
| `opacity: 0.5` | `opacity-50` |
| `overflow: "hidden"` | `overflow-hidden` |
| Shadow (small) | `shadow-sm` |
| Shadow (medium) | `shadow-md` |

## Code Generation Patterns

### Basic Component

Pencil 노드:
```json
{
  "type": "frame",
  "layout": "vertical",
  "padding": 24,
  "gap": 16,
  "fill": "#FFFFFF",
  "cornerRadius": 12,
  "children": [
    { "type": "text", "content": "Title", "fontSize": 24, "fontWeight": "bold" },
    { "type": "text", "content": "Description", "textColor": "#64748B" }
  ]
}
```

React + Tailwind:
```tsx
function Card() {
  return (
    <div className="flex flex-col p-6 gap-4 bg-white rounded-xl">
      <h2 className="text-2xl font-bold">Title</h2>
      <p className="text-slate-500">Description</p>
    </div>
  )
}
```

### Interactive Component

버튼 컴포넌트:
```tsx
interface ButtonProps {
  children: React.ReactNode
  variant?: ''primary'' | ''secondary''
  onClick?: () => void
}

function Button({ children, variant = ''primary'', onClick }: ButtonProps) {
  const baseClasses = "flex items-center justify-center px-6 py-3 gap-2 rounded-lg font-medium transition-colors"
  const variantClasses = {
    primary: "bg-blue-500 text-white hover:bg-blue-600",
    secondary: "bg-transparent border border-blue-500 text-blue-500 hover:bg-blue-50"
  }

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
```

### Layout Component

페이지 레이아웃:
```tsx
function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex flex-col w-64 p-6 gap-4 bg-slate-50 border-r border-slate-200">
        <h1 className="text-xl font-bold">Logo</h1>
        <nav className="flex flex-col gap-2">
          <a href="#" className="px-4 py-2 rounded-lg hover:bg-slate-100">Dashboard</a>
          <a href="#" className="px-4 py-2 rounded-lg hover:bg-slate-100">Settings</a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  )
}
```

## Variable to Tailwind Config

Pencil 변수를 tailwind.config.js로 변환:

### Input (Pencil Variables)
```json
{
  "colors": {
    "primary": { "500": "#3B82F6", "600": "#2563EB" },
    "neutral": { "50": "#F8FAFC", "900": "#0F172A" }
  },
  "spacing": { "4": 16, "6": 24, "8": 32 },
  "radii": { "md": 8, "lg": 12 }
}
```

### Output (Tailwind Config)
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          500: ''#3B82F6'',
          600: ''#2563EB'',
        },
        neutral: {
          50: ''#F8FAFC'',
          900: ''#0F172A'',
        },
      },
      spacing: {
        4: ''16px'',
        6: ''24px'',
        8: ''32px'',
      },
      borderRadius: {
        md: ''8px'',
        lg: ''12px'',
      },
    },
  },
}
```

## Best Practices

### Component Naming

- 의미 있는 이름 사용 (Card, Button, Header)
- PascalCase 사용
- 파일명은 컴포넌트명과 일치

### Props Design

- 필수 props와 선택 props 구분
- 합리적인 기본값 제공
- TypeScript 인터페이스 정의

### Tailwind Usage

- 유틸리티 클래스 우선
- 반복되는 패턴은 컴포넌트로 추출
- 복잡한 값은 arbitrary values 사용 `w-[320px]`
- `@apply`는 최소화

### Accessibility

- 시맨틱 HTML 요소 사용
- ARIA 속성 적절히 추가
- 키보드 네비게이션 지원
- 색상 대비 확인

## Output Format

단일 TSX 파일 형식:

```tsx
// ComponentName.tsx
import { useState } from ''react''

interface ComponentNameProps {
  // props 정의
}

export function ComponentName({ ...props }: ComponentNameProps) {
  // 상태 및 로직

  return (
    // JSX
  )
}
```

## Additional Resources

### Reference Files

- **`references/tailwind-mapping.md`** - 전체 Pencil-Tailwind 매핑 테이블
- **`references/component-templates.md`** - 공통 컴포넌트 템플릿
' WHERE slug = 'neversight-design-to-code';