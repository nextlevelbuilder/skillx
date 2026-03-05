UPDATE skills SET content = '---
name: slides-generator
description: Generate interactive presentation slides using React + Tailwind, and export to standalone single-file HTML. Triggers on keywords like "slides", "presentation", "PPT", "demo", "benchmark", or when user requests export. Uses agent-browser skill for browser verification before export (install with `npx skills add vercel-labs/agent-browser` if not available).
---

# Slides Generator

Generate professional, interactive presentation slides with React + Tailwind.

## Project Structure

Each slide project is organized in a dedicated folder:

```
<project-folder>/
├── context.md          ← Collected knowledge and context from user
├── researches/         ← Research documents (when topic requires research)
│   └── YYYY-MM-DD-topic.md
├── slides.md           ← Markdown slides for preview/discussion
├── source/             ← React source code (from template)
│   ├── package.json
│   ├── vite.config.js
│   ├── vite.standalone.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── index.css
│       └── slides/
│           ├── 01-hero.jsx
│           ├── 02-content.jsx
│           └── ...
├── verify/             ← Verification screenshots (from browser testing)
└── slide.html          ← Final standalone HTML (auto-generated)
```

## Workflow Overview

```
Step 1: Initialize Project Folder
    ↓
Step 2: Collect Requirements (Progressive Disclosure)
    Phase 1: Topic → Phase 2: Audience → Phase 3: Style → Phase 4: Content
    ↓
Step 2.5: Research Checkpoint
    "Would you like me to research [topic]?" → User confirms
    ↓
Step 3: Create context.md + slides.md
    ↓
Step 4: Confirm Outline with User
    ↓
Step 5: Create Source Code → source/
    ↓
Step 6: Generate Slides (parallel subagents)
    ↓
Step 7: Dev Mode + Browser Verification (REQUIRED)
    ↓
Step 8: Build & Export → slide.html
```

## Step 1: Initialize Project Folder

**Ask user for project folder if not provided:**
```
Where would you like to save this presentation?
Default: ./presentation-name
```

**Create folder structure:**
```bash
mkdir -p <project-folder>/source <project-folder>/researches <project-folder>/verify
```

## Step 2: Collect Requirements (Progressive Disclosure)

Use progressive disclosure: ask 3-5 questions at a time, reveal more based on answers.

See [context-guide.md](references/context-guide.md) for detailed question flow.

### Question Flow

**Phase 1 - Quick Start** (Always):
```
"What''s the presentation about?"
"Any content or notes to include?" (optional)
```

**Phase 2 - Audience & Purpose** (Always):
```
"Who will view this?"
  - Executives / Decision makers
  - Technical team / Developers
  - General audience / Mixed
  - Customers / External

"What''s the goal?"
  - Inform / Persuade / Demo / Report
```

**Phase 3 - Style Discovery** (Always):

**Step 1**: Get keywords from user
```
"Describe the vibe in a few words"
  Examples: "tech, modern, dark" or "professional, clean, corporate"
```

**Step 2**: Use **ui-ux-pro-max** skill for comprehensive design recommendations

```bash
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "<topic> <keywords> presentation" --design-system -p "<Presentation Name>"
```

This provides:
- Style recommendations with reasoning
- Color palette suggestions
- Typography pairings
- Animation guidelines

**Step 3**: Combine with [palettes.md](references/palettes.md) to present 5 options
Example prompt to user:
```
Based on your description and design analysis, here are 5 style options:

1. **Dark Sapphire Blue** (glass) - Recommended by ui-ux-pro-max
   Dark tech with blue accents, gradient glows
   Typography: Sora + Source Sans 3
   Best for: Tech products, developer tools

2. **Electric City Nights** (glass)
   Urban dark with vibrant blue highlights
   Typography: DM Sans + Work Sans
   Best for: Modern SaaS, tech startups

3. **Cyberpunk** (glass)
   Neon colors, futuristic sci-fi feel
   Typography: Outfit + Nunito Sans
   Best for: Gaming, AI/ML, futuristic topics

4. **Minimal Modern Light** (flat)
   Clean light theme with blue accents
   Typography: DM Sans + Work Sans
   Best for: Corporate, professional presentations

5. **Hacker News** (glass)
   Dark with orange accents, geek aesthetic
   Typography: Sora + Source Sans 3
   Best for: Developer content, technical demos

Which style? (1-5)
```

**Selection is captured in context.md** under Style section.

**Phase 4 - Content Depth** (Conditional):
```
"What are 3-5 key points to cover?"
"Any specific data to include?"
  - Yes, I have data → [Get details]
  - Research needed → [Trigger Step 2.5]
  - No data needed → [Skip]
```

### Drill-Down for Abstract Terms

When users give vague terms, clarify:

| User Says | Ask |
|-----------|-----|
| "Professional" | "Clean/minimal, or rich/detailed?" |
| "Modern" | "Can you point to an example?" |
| "Engaging" | "Animations, or compelling content?" |

### Save to context.md

After questions, create `context.md` capturing:
- Topic, purpose, audience from Phase 1-2
- **Selected style** (palette ID, name, style type) from Phase 3
- Key points and data needs from Phase 4

```markdown
## Style (User Selected)
- **Palette ID**: dark-sapphire-blue
- **Palette Name**: Dark Sapphire Blue
- **Mode**: dark
- **Style**: glass
- **Typography**:
  - Display: Sora
  - Body: Source Sans 3
- **User Keywords**: "tech, modern, dark"
- **Design Source**: ui-ux-pro-max + palettes.md
```

## Step 2.5: Research Checkpoint

**Always ask before researching** - apply Just-In-Time research pattern.

### When to Offer Research

Offer research when:
- Topic involves comparisons (A vs B)
- User mentions data/statistics/benchmarks
- Topic is current events or recent technology
- User needs facts they don''t have

Skip research when:
- User provides their own data
- Topic is personal/internal
- User explicitly declines

### Research Prompt

```
"This topic would benefit from research. Would you like me to:

[ ] Research current data/statistics
[ ] Find competitive comparisons
[ ] Gather industry trends
[ ] Skip research - I''ll provide content"
```

### Research Workflow

```
1. User confirms research needed
    ↓
2. Conduct targeted web search
    ↓
3. Document in researches/ folder
    ↓
4. Present summary to user:
   "I found: [key findings]. Does this look accurate?"
    ↓
5. User confirms → Update context.md
```

### Research Templates

See [research-templates.md](references/research-templates.md) for:
- **Statistics & Data** - Metrics, benchmarks, numbers
- **Competitive Analysis** - A vs B comparisons
- **Trends & Forecasts** - Industry outlook
- **Quick Facts** - Simple fact lookup

### File Organization

```
researches/
├── YYYY-MM-DD-statistics.md    # Data and numbers
├── YYYY-MM-DD-comparison.md    # A vs B analysis
└── YYYY-MM-DD-trends.md        # Industry trends
```

### Quality Checklist

Before using researched data:
- [ ] Source is authoritative
- [ ] Data is recent (<6 months for fast fields)
- [ ] Cross-referenced with another source
- [ ] User has confirmed accuracy

**After research, update context.md** with verified data and sources.

## Step 3: Create Markdown Slides

Create `slides.md` with complete design system and content structure. See [slides-design.md](references/slides-design.md) for detailed patterns.

### 3.1 Generate Design System (Optional but Recommended)

Use **ui-ux-pro-max** skill to get comprehensive design recommendations:

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<topic> <style keywords>" --design-system -p "<Presentation Name>"
```

**Example:**
```bash
python3 skills/ui-ux-pro-max/scripts/search.py "tech benchmark modern dark glass" --design-system -p "Claude Benchmark"
```

### 3.2 slides.md Template

```markdown
# [Presentation Title]

## Design System

### Theme
- **Palette**: [theme-id from palettes.md]
- **Mode**: dark / light
- **Style**: glass / flat

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| bg-base | #0f1c2e | Main background |
| primary-500 | #4d648d | Primary accent |
| accent-500 | #3d5a80 | Contrast accent |
| text-primary | #ffffff | Main text |
| text-secondary | #cee8ff | Secondary text |

### Typography
- **Display**: Sora (headings)
- **Body**: Source Sans 3 (content)

### Effects
- **Cards**: glass with border-white/20
- **Animations**: stagger reveal (0.1s delay)
- **Background**: gradient glow + grid pattern

---

## Slide 1: Hero
**Type**: Hero
**Layout**: centered
**Title**: Main Title Here
**Subtitle**: Supporting tagline
**Background**: gradient glow (primary top-left, accent bottom-right)
**Animation**: fade-in + scale (0.6s)

---

## Slide 2: Overview
**Type**: Content
**Layout**: three-column
**Title**: What We''ll Cover
**Cards**: 3 cards, glass style
**Points**:
- [icon: Zap] First key point
- [icon: Shield] Second key point
- [icon: Rocket] Third key point
**Animation**: stagger reveal (0.1s)

---

## Slide 3: Details
**Type**: Data
**Layout**: stat-cards
**Title**: Key Metrics
**Stats**:
| Metric | Value | Trend | Context |
|--------|-------|-------|---------|
| Users | 10K+ | +25% | Monthly active |
| Growth | 40% | +15% | Year over year |
| NPS | 72 | +8 | Industry avg: 45 |
**Animation**: count-up numbers

---

## Slide 4: Comparison
**Type**: Comparison
**Layout**: versus
**Title**: Head to Head
**Comparison**:
| Feature | Option A | Option B |
|---------|----------|----------|
| Speed | ✓ Fast | ○ Medium |
| Cost | $99/mo | $149/mo |
| Support | 24/7 | Business |
**Highlight**: Option A for performance

---

## Slide 5: Summary
**Type**: Summary
**Layout**: takeaways
**Title**: Key Takeaways
**Takeaways**:
1. First key insight
2. Second key insight
3. Third key insight
**CTA**: "Get Started" → [link]
**Animation**: fade-in sequential
```

### 3.3 Slide Types Reference

| Type | Use For | Layouts |
|------|---------|---------|
| Hero | Opening slide | centered, split, asymmetric |
| Content | Information, bullets | single-column, two-column, icon-list |
| Data | Statistics, metrics | stat-cards, chart-focus, dashboard |
| Comparison | Side-by-side analysis | versus, feature-matrix, ranking |
| Timeline | Process, roadmap | horizontal, vertical, milestone |
| Grid | Multiple cards | 2x2, 2x3, bento |
| Quote | Testimonials | centered, with-avatar |
| Summary | Closing, CTA | takeaways, cta-focused |

### 3.4 Design Patterns by Scenario

| Scenario | Theme | Style | Typography |
|----------|-------|-------|------------|
| Tech/Product | dark-sapphire-blue | glass | Sora + Source Sans 3 |
| Professional | banking-website | flat | DM Sans + Work Sans |
| Creative | cyberpunk or neon | glass | Outfit + Nunito Sans |
| Nature | summer-meadow | flat | Manrope + Source Sans 3 |
| Minimal | black-and-white | flat | DM Sans + Work Sans |

## Step 4: Confirm with User

Present the outline for confirmation:

```markdown
## Presentation Outline

**Title**: [Title]
**Theme**: [theme-id] ([glass/flat] style)
**Folder**: [project-folder]

**Slides**:
1. Hero - Title and overview
2. Content - Key points
3. Data - Metrics/charts
4. Summary - Conclusions

**Files to create:**
- context.md ✓
- slides.md ✓
- source/ (React project)
- slide.html (final output)

**Confirm to generate?**
```

## Step 5: Create Source Code

Copy template and configure:

```bash
# 1. Copy template
cp -r <skill-path>/assets/template/* <project-folder>/source/

# 2. Update tailwind.config.js with theme colors
# 3. Update index.html title
# 4. Update App.jsx with presentation name
```

## Step 6: Generate Slides

Generate each slide JSX file based on `slides.md` content.

**Before generating, read:**
- [aesthetics.md](references/aesthetics.md) - Design philosophy
- [principles.md](references/principles.md) - Technical principles

**Use vercel-react-best-practices skill** for React code generation to ensure:
- Proper component composition and patterns
- Performance-optimized rendering
- Clean, maintainable code structure

**Technical Requirements:**
- Framework: React function component
- Styling: Tailwind CSS
- Icons: lucide-react
- Animations: framer-motion
- Export: default function component

**Theme Colors (use variables, not hardcoded):**
- primary-50 to primary-950
- accent-50 to accent-950
- bg-base, bg-card, bg-elevated
- text-primary, text-secondary, text-muted
- border-default, border-subtle

**Style Options:**
- Glass: `glass` class or `bg-white/10 backdrop-blur-md border-white/20`
- Flat: `bg-bg-card shadow-sm border-border-default`

**Layout Rules (CRITICAL):**

⛔ FORBIDDEN:
- `h-screen`, `min-h-screen` - breaks layout
- `h-full` on content wrappers
- Extra padding on `slide-page`

✅ REQUIRED Structure:
```jsx
<div className="slide-page">
  {/* Background - absolute positioning */}
  <div className="absolute inset-0 pointer-events-none">...</div>

  {/* Header */}
  <header className="relative z-10 mb-6 shrink-0">
    <h1>Title</h1>
  </header>

  {/* Content - auto-fills remaining space */}
  <div className="slide-content relative z-10">
    {/* Grid/cards here */}
  </div>
</div>
```

**Grid Layouts:**
- 2 cards: `grid-auto-fit grid-cols-2`
- 3 cards: `grid-auto-fit grid-1x3`
- 4 cards (2x2): `grid-auto-fit grid-2x2`
- 6 cards (2x3): `grid-auto-fit grid-2x3`

**Animation Patterns:**
```jsx
import { motion } from ''framer-motion'';

// Stagger container
const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

// Child item
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

// Hover effect
<motion.div whileHover={{ scale: 1.02 }}>...</motion.div>
```

**File naming:** `01-hero.jsx`, `02-overview.jsx`, etc.

**Update App.jsx after all slides generated:**

```jsx
// Add imports at top
import Slide01 from ''./slides/01-hero'';
import Slide02 from ''./slides/02-content'';
// ...

// Update SLIDES array
const SLIDES = [Slide01, Slide02, ...];

// Update NAV_ITEMS array (used for navigation labels)
const NAV_ITEMS = [
  { slideIndex: 0, label: ''Hero'' },
  { slideIndex: 1, label: ''Content'' },
  // ...
];

// Update PRESENTATION_NAME
const PRESENTATION_NAME = ''Your Presentation Title'';
```

**Navigation Features:**

The template includes quick-jump navigation:

| Feature | How to Use |
|---------|------------|
| Slide dots | Click dots at bottom center (≤12 slides) |
| Number keys | Press 1-9 to jump to slides 1-9 |
| Quick nav | Press G or click progress bar to open grid picker |
| Menu | Click hamburger for full slide list with labels |
| Arrows | ← → keys or click chevron buttons |

## Step 7: Dev Mode + Browser Verification (REQUIRED)

**IMPORTANT**: Always verify slides in dev mode BEFORE building the standalone export. This catches UI, animation, and interaction issues early.

See [browser-verification.md](references/browser-verification.md) for detailed verification procedures.

### 7.1 Start Dev Server

```bash
cd <project-folder>/source
npm install
npm run dev
# Server runs at http://localh

<!-- truncated -->' WHERE slug = 'neversight-slides-generator';
UPDATE skills SET content = '---
name: react-testing-library
description: "React Testing Library: user-centric component testing with queries, user-event simulation, async utilities, and accessibility-first API."
version: "16.3.2"
release_date: "2026-01-19"
---

# React Testing Library Skill

## Quick Navigation

| Topic       | Link                                                   |
| ----------- | ------------------------------------------------------ |
| Queries     | [references/queries.md](references/queries.md)         |
| User Events | [references/user-events.md](references/user-events.md) |
| API         | [references/api.md](references/api.md)                 |
| Async       | [references/async.md](references/async.md)             |
| Debugging   | [references/debugging.md](references/debugging.md)     |
| Config      | [references/config.md](references/config.md)           |

---

## Installation

```bash
# Core (v16+: @testing-library/dom is peer dependency)
npm install --save-dev @testing-library/react @testing-library/dom

# TypeScript support
npm install --save-dev @types/react @types/react-dom

# Recommended: user-event for interactions
npm install --save-dev @testing-library/user-event

# Recommended: jest-dom for matchers
npm install --save-dev @testing-library/jest-dom
```

**React 19 support**: Requires `@testing-library/react` v16.1.0+

## Core Philosophy

> "The more your tests resemble the way your software is used, the more confidence they can give you."

**Avoid testing**:

- Internal state of components
- Internal methods
- Lifecycle methods
- Child component implementation details

**Test instead**:

- What users see and interact with
- Behavior from user''s perspective
- Accessibility (queries by role, label)

---

## Query Priority

Use queries in this order of preference:

### 1. Accessible to Everyone (Preferred)

```ts
// Best — by ARIA role
getByRole("button", { name: /submit/i });
getByRole("textbox", { name: /email/i });

// Form fields — by label
getByLabelText("Email");

// Non-interactive content — by text
getByText("Welcome back!");
```

### 2. Semantic Queries

```ts
// Images
getByAltText("Company logo");

// Title attribute (less reliable)
getByTitle("Close");
```

### 3. Test IDs (Escape Hatch)

```ts
// Only when other queries don''t work
getByTestId("custom-element");
```

---

## Query Types

| Type            | No Match | 1 Match | >1 Match | Async |
| --------------- | -------- | ------- | -------- | ----- |
| `getBy...`      | throw    | return  | throw    | No    |
| `queryBy...`    | null     | return  | throw    | No    |
| `findBy...`     | throw    | return  | throw    | Yes   |
| `getAllBy...`   | throw    | array   | array    | No    |
| `queryAllBy...` | []       | array   | array    | No    |
| `findAllBy...`  | throw    | array   | array    | Yes   |

**When to use**:

- `getBy*` — element exists
- `queryBy*` — element may not exist (assertions like `expect(...).not.toBeInTheDocument()`)
- `findBy*` — element appears asynchronously

---

## Basic Test Pattern

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

test("shows greeting after login", async () => {
  const user = userEvent.setup();
  render(<App />);

  // Act — simulate user interactions
  await user.type(screen.getByLabelText(/username/i), "john");
  await user.click(screen.getByRole("button", { name: /login/i }));

  // Assert — verify outcome
  expect(await screen.findByText(/welcome, john/i)).toBeInTheDocument();
});
```

---

## User Events

Always use `@testing-library/user-event` over `fireEvent`:

```ts
import userEvent from "@testing-library/user-event";

test("user interactions", async () => {
  const user = userEvent.setup();

  // Click
  await user.click(element);
  await user.dblClick(element);
  await user.tripleClick(element);

  // Type
  await user.type(input, "Hello");
  await user.clear(input);

  // Select
  await user.selectOptions(select, ["option1", "option2"]);

  // Keyboard
  await user.keyboard("{Enter}");
  await user.keyboard("[ShiftLeft>]a[/ShiftLeft]"); // Shift+A

  // Clipboard
  await user.copy();
  await user.paste();

  // Pointer
  await user.hover(element);
  await user.unhover(element);
});
```

---

## Async Patterns

### waitFor — Retry Until Success

```ts
await waitFor(() => {
  expect(screen.getByText("Loaded")).toBeInTheDocument();
});

// With options
await waitFor(() => expect(callback).toHaveBeenCalled(), {
  timeout: 5000,
  interval: 100,
});
```

### findBy — Built-in waitFor

```ts
// Equivalent to: await waitFor(() => getByText(''Loaded''))
const element = await screen.findByText("Loaded");
```

### waitForElementToBeRemoved

```ts
await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
```

---

## Common Patterns

### Custom Render with Providers

```tsx
// test-utils.tsx
import { render } from "@testing-library/react";
import { ThemeProvider } from "./ThemeProvider";
import { AuthProvider } from "./AuthProvider";

function AllProviders({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}

const customRender = (ui, options) => render(ui, { wrapper: AllProviders, ...options });

export * from "@testing-library/react";
export { customRender as render };
```

### Testing Hooks

```ts
import { renderHook, act } from "@testing-library/react";

test("useCounter increments", () => {
  const { result } = renderHook(() => useCounter());

  expect(result.current.count).toBe(0);

  act(() => {
    result.current.increment();
  });

  expect(result.current.count).toBe(1);
});
```

### Rerender with New Props

```ts
const { rerender } = render(<Counter count={1} />);
expect(screen.getByText("Count: 1")).toBeInTheDocument();

rerender(<Counter count={2} />);
expect(screen.getByText("Count: 2")).toBeInTheDocument();
```

### Query Within Container

```ts
import { within } from "@testing-library/react";

const modal = screen.getByRole("dialog");
const submitBtn = within(modal).getByRole("button", { name: /submit/i });
```

---

## Debugging

```ts
// Print entire DOM
screen.debug();

// Print specific element
screen.debug(screen.getByRole("button"));

// Log available roles
import { logRoles } from "@testing-library/react";
logRoles(container);

// With prettyDOM options
screen.debug(undefined, 10000); // max length
```

---

## jest-dom Matchers

```ts
import "@testing-library/jest-dom";

expect(element).toBeInTheDocument();
expect(element).toBeVisible();
expect(element).toBeEnabled();
expect(element).toBeDisabled();
expect(element).toHaveTextContent("Hello");
expect(element).toHaveValue("input value");
expect(element).toHaveAttribute("href", "/home");
expect(element).toHaveClass("active");
expect(element).toHaveFocus();
expect(element).toBeChecked();
```

---

## Configuration

```ts
import { configure } from "@testing-library/react";

configure({
  // Custom test ID attribute
  testIdAttribute: "data-my-test-id",

  // Async timeout
  asyncUtilTimeout: 5000,

  // Default hidden
  defaultHidden: true,

  // Throw suggestions (debugging)
  throwSuggestions: true,
});
```

---

## ❌ Prohibitions (Anti-patterns)

```ts
// ❌ Don''t query by class/id
container.querySelector(".my-class");

// ❌ Don''t use container.firstChild
const { container } = render(<Component />);
expect(container.firstChild).toHaveClass("active");

// ❌ Don''t use fireEvent when userEvent works
fireEvent.click(button); // Use userEvent.click instead

// ❌ Don''t test implementation details
expect(component.state.loading).toBe(false);

// ❌ Don''t use waitFor with findBy
await waitFor(() => screen.findByText("x")); // findBy already waits

// ❌ Don''t assert inside waitFor callback (unless necessary)
await waitFor(() => {
  expect(mockFn).toHaveBeenCalled(); // OK - need to wait for call
});
```

---

## ✅ Best Practices

```ts
// ✅ Use screen for all queries
import { render, screen } from "@testing-library/react";
render(<Component />);
screen.getByRole("button"); // Good

// ✅ Prefer userEvent over fireEvent
const user = userEvent.setup();
await user.click(button);

// ✅ Use findBy for async elements
const element = await screen.findByText("Loaded");

// ✅ Use queryBy for non-existence assertions
expect(screen.queryByText("Error")).not.toBeInTheDocument();

// ✅ Use within for scoped queries
const form = screen.getByRole("form");
within(form).getByLabelText("Email");

// ✅ Use accessible queries (role, label, text)
getByRole("button", { name: /submit/i });
```

---

## TextMatch Options

```ts
// Exact match (default)
getByText("Hello World");

// Substring match
getByText("llo Worl", { exact: false });

// Regex
getByText(/hello world/i);

// Custom function
getByText((content, element) => {
  return element.tagName === "SPAN" && content.startsWith("Hello");
});
```

---

## Quick Reference

| Import              | Usage                             |
| ------------------- | --------------------------------- |
| `render`            | Render component to DOM           |
| `screen`            | Query the rendered DOM            |
| `cleanup`           | Unmount components (auto in Jest) |
| `act`               | Wrap state updates                |
| `renderHook`        | Test custom hooks                 |
| `within`            | Scope queries to element          |
| `waitFor`           | Retry until assertion passes      |
| `configure`         | Set global options                |
| `userEvent.setup()` | Create user event instance        |
' WHERE slug = 'neversight-react-testing-library-ill-md';
UPDATE skills SET content = '---
name: react-development-patterns
description: "React 18+ development patterns including components, hooks, state management, API integration, and accessibility. Use when: (1) building React components, (2) designing user interfaces, (3) implementing state management, (4) writing frontend tests."
layer: 2
tech_stack: [typescript, react, javascript]
topics: [react, typescript, hooks, state-management, accessibility, components]
depends_on: [typescript-advanced-types, modern-javascript-patterns]
complements: [javascript-testing-patterns, e2e-testing-patterns]
keywords: [React, useState, useEffect, useQuery, TypeScript, Component, Props, Accessibility, WCAG]
---

# React Development Patterns

React 18+ patterns for building modern, accessible, type-safe user interfaces.

## When to Use

- Building React components with TypeScript
- Designing UI wireframes and user flows
- Implementing state management
- Creating API service layers
- Writing accessible frontend code

## Component Patterns

### Basic Component

```tsx
import { FC } from ''react'';

interface {Component}Props {
  title: string;
  variant?: ''primary'' | ''secondary'';
  disabled?: boolean;
  onClick?: () => void;
}

export const {Component}: FC<{Component}Props> = ({
  title,
  variant = ''primary'',
  disabled = false,
  onClick,
}) => {
  return (
    <button
      className={`btn btn-${variant}`}
      disabled={disabled}
      onClick={onClick}
    >
      {title}
    </button>
  );
};
```

### Data Fetching Component

```tsx
import { FC } from ''react'';
import { useQuery } from ''@tanstack/react-query'';
import { {entity}Service } from ''@/services/{entity}Service'';
import type { {Entity}Dto } from ''@/types'';

interface {Entity}ListProps {
  onSelect: (entity: {Entity}Dto) => void;
}

export const {Entity}List: FC<{Entity}ListProps> = ({ onSelect }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: [''{entities}''],
    queryFn: {entity}Service.getAll,
  });

  if (isLoading) return <Skeleton count={5} />;
  if (error) return <ErrorMessage error={error} />;
  if (!data?.length) return <EmptyState message="No items found" />;

  return (
    <ul role="list" aria-label="{Entity} list">
      {data.map((entity) => (
        <{Entity}Card
          key={entity.id}
          entity={entity}
          onClick={() => onSelect(entity)}
        />
      ))}
    </ul>
  );
};
```

## API Service Pattern

```typescript
import { api } from ''@/lib/api'';
import type { {Entity}Dto, Create{Entity}Dto, PagedResult } from ''@/types'';

export const {entity}Service = {
  getAll: async (params?: { skip?: number; take?: number }): Promise<PagedResult<{Entity}Dto>> => {
    const response = await api.get(''/api/app/{entities}'', { params });
    return response.data;
  },

  getById: async (id: string): Promise<{Entity}Dto> => {
    const response = await api.get(`/api/app/{entities}/${id}`);
    return response.data;
  },

  create: async (data: Create{Entity}Dto): Promise<{Entity}Dto> => {
    const response = await api.post(''/api/app/{entities}'', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Create{Entity}Dto>): Promise<{Entity}Dto> => {
    const response = await api.put(`/api/app/{entities}/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/app/{entities}/${id}`);
  },
};
```

## Wireframe Template

```markdown
## Screen: [Screen Name]

### Layout
┌─────────────────────────────────────┐
│ [Header: Logo | Nav | User Menu]    │
├─────────────────────────────────────┤
│ [Sidebar]  │  [Main Content]        │
│            │                        │
│ - Nav 1    │  ┌─────────┐ ┌─────────┐│
│ - Nav 2    │  │ Card 1  │ │ Card 2  ││
│ - Nav 3    │  └─────────┘ └─────────┘│
├─────────────────────────────────────┤
│ [Footer]                            │
└─────────────────────────────────────┘

### Components
- Header: Logo, Navigation, UserMenu
- Sidebar: NavItem[], CollapsibleSection
- Card: Image?, Title, Description, ActionButton

### Interactions
- Card click → Navigate to detail
- NavItem hover → Show tooltip

### States
- Loading: Skeleton placeholders
- Empty: "No items" + CTA
- Error: Error banner + retry
```

## Component Specification Template

```markdown
## Component: [ComponentName]

### Props
| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| variant | ''primary'' \| ''secondary'' | No | ''primary'' | Visual style |
| disabled | boolean | No | false | Disable interactions |
| onClick | () => void | No | - | Click handler |

### States
- Default, Hover, Active, Disabled, Loading, Error

### Accessibility
- Role: button
- Keyboard: Enter/Space to activate
- aria-label required when icon-only
```

## State Management Patterns

### React Query (Server State)

```tsx
// queries.ts
export const use{Entity}Query = (id: string) => useQuery({
  queryKey: [''{entity}'', id],
  queryFn: () => {entity}Service.getById(id),
  staleTime: 5 * 60 * 1000, // 5 minutes
});

export const use{Entities}Query = (params?: ListParams) => useQuery({
  queryKey: [''{entities}'', params],
  queryFn: () => {entity}Service.getAll(params),
});

// mutations.ts
export const useCreate{Entity} = () => useMutation({
  mutationFn: {entity}Service.create,
  onSuccess: () => queryClient.invalidateQueries([''{entities}'']),
});
```

### Zustand (Client State)

```tsx
import { create } from ''zustand'';

interface UIStore {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),
}));
```

## Accessibility Checklist

- [ ] All interactive elements keyboard accessible
- [ ] Focus indicators visible
- [ ] Color contrast >= 4.5:1 for text
- [ ] Images have alt text
- [ ] Forms have labels
- [ ] Error messages associated with inputs
- [ ] Skip navigation link present
- [ ] Page has single h1
- [ ] Landmarks used (main, nav, aside)
- [ ] ARIA attributes used correctly

## Project Structure

```
ui/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── common/        # Buttons, inputs, cards
│   │   └── layout/        # Header, sidebar, footer
│   ├── features/          # Feature-based modules
│   │   └── {feature}/     # Feature module
│   ├── hooks/             # Custom React hooks
│   ├── services/          # API service layer
│   ├── store/             # State management
│   ├── types/             # TypeScript types
│   └── utils/             # Utility functions
├── tests/
│   ├── unit/              # Component unit tests
│   ├── integration/       # Feature integration tests
│   └── e2e/               # Playwright E2E tests
└── public/
```

## Testing Patterns

### Component Test

```tsx
import { render, screen, fireEvent } from ''@testing-library/react'';
import { {Component} } from ''./{Component}'';

describe(''{Component}'', () => {
  it(''renders with title'', () => {
    render(<{Component} title="Test" />);
    expect(screen.getByText(''Test'')).toBeInTheDocument();
  });

  it(''calls onClick when clicked'', () => {
    const handleClick = jest.fn();
    render(<{Component} title="Test" onClick={handleClick} />);
    fireEvent.click(screen.getByRole(''button''));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it(''is disabled when disabled prop is true'', () => {
    render(<{Component} title="Test" disabled />);
    expect(screen.getByRole(''button'')).toBeDisabled();
  });
});
```

## Shared Knowledge

| Topic | File |
|-------|------|
| TypeScript types | `typescript-advanced-types` skill |
| ES6+ patterns | `modern-javascript-patterns` skill |
| Testing patterns | `javascript-testing-patterns` skill |
' WHERE slug = 'neversight-react-development-patterns';
UPDATE skills SET content = '---
name: fizzy
description: Manages Fizzy boards, cards, steps, comments, and reactions. Use when user asks about boards, cards, tasks, backlog or anything Fizzy.
---

# Fizzy CLI Skill

Manage Fizzy boards, cards, steps, comments, and reactions.

## Quick Reference

| Resource | List | Show | Create | Update | Delete | Other |
|----------|------|------|--------|--------|--------|-------|
| board | `board list` | `board show ID` | `board create` | `board update ID` | `board delete ID` | `migrate board ID` |
| card | `card list` | `card show NUMBER` | `card create` | `card update NUMBER` | `card delete NUMBER` | `card move NUMBER` |
| search | `search QUERY` | - | - | - | - | - |
| column | `column list --board ID` | `column show ID --board ID` | `column create` | `column update ID` | `column delete ID` | - |
| comment | `comment list --card NUMBER` | `comment show ID --card NUMBER` | `comment create` | `comment update ID` | `comment delete ID` | - |
| step | - | `step show ID --card NUMBER` | `step create` | `step update ID` | `step delete ID` | - |
| reaction | `reaction list` | - | `reaction create` | - | `reaction delete ID` | - |
| tag | `tag list` | - | - | - | - | - |
| user | `user list` | `user show ID` | - | - | - | - |
| notification | `notification list` | - | - | - | - | - |

---

## ID Formats

**IMPORTANT:** Cards use TWO identifiers:

| Field | Format | Use For |
|-------|--------|---------|
| `id` | `03fe4rug9kt1mpgyy51lq8i5i` | Internal ID (in JSON responses) |
| `number` | `579` | CLI commands (`card show`, `card update`, etc.) |

**All card CLI commands use the card NUMBER, not the ID.**

Other resources (boards, columns, comments, steps, reactions, users) use their `id` field.

---

## Response Structure

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },           // Single object or array
  "summary": "4 boards",     // Human-readable description
  "breadcrumbs": [ ... ],    // Contextual next actions (omitted when empty)
  "meta": {
    "timestamp": "2026-01-12T21:21:48Z"
  }
}
```

**Summary field formats:**
| Command | Example Summary |
|---------|-----------------|
| `board list` | "5 boards" |
| `board show ID` | "Board: Engineering" |
| `card list` | "42 cards (page 1)" or "42 cards (all)" |
| `card show 123` | "Card #123: Fix login bug" |
| `search "bug"` | "7 results for \"bug\"" |
| `notification list` | "8 notifications (3 unread)" |

**List responses with pagination:**
```json
{
  "success": true,
  "data": [ ... ],
  "summary": "10 cards (page 1)",
  "pagination": {
    "has_next": true,
    "next_url": "https://..."
  },
  "meta": { ... }
}
```

**Breadcrumbs (contextual next actions):**

Responses include a `breadcrumbs` array suggesting what you can do next. Each breadcrumb has:
- `action`: Short action name (e.g., "comment", "close", "assign")
- `cmd`: Ready-to-run command with actual values interpolated
- `description`: Human-readable description

```bash
fizzy card show 42 | jq ''.breadcrumbs''
```

```json
[
  {"action": "comment", "cmd": "fizzy comment create --card 42 --body \"text\"", "description": "Add comment"},
  {"action": "triage", "cmd": "fizzy card column 42 --column <column_id>", "description": "Move to column"},
  {"action": "close", "cmd": "fizzy card close 42", "description": "Close card"},
  {"action": "assign", "cmd": "fizzy card assign 42 --user <user_id>", "description": "Assign user"}
]
```

Use breadcrumbs to discover available actions without memorizing the full CLI. Values like card numbers and board IDs are pre-filled; placeholders like `<column_id>` need to be replaced.

**Error responses:**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Not Found",
    "status": 404
  },
  "meta": { ... }
}
```

**Create/update responses include location:**
```json
{
  "success": true,
  "data": { ... },
  "location": "/6102600/cards/579.json",
  "meta": { ... }
}
```

---

## Resource Schemas

Complete field reference for all resources. Use these exact field paths in jq queries.

### Card Schema

**IMPORTANT:** `card list` and `card show` return different fields. `steps` only in `card show`.

| Field | Type | Description |
|-------|------|-------------|
| `number` | integer | **Use this for CLI commands** |
| `id` | string | Internal ID (in responses only) |
| `title` | string | Card title |
| `description` | string | Plain text content (**NOT an object**) |
| `description_html` | string | HTML version with attachments |
| `status` | string | Usually "published" for active cards |
| `closed` | boolean | true = card is closed |
| `golden` | boolean | true = starred/important |
| `image_url` | string/null | Header/background image URL |
| `has_more_assignees` | boolean | More assignees than shown |
| `created_at` | timestamp | ISO 8601 |
| `last_active_at` | timestamp | ISO 8601 |
| `url` | string | Web URL |
| `comments_url` | string | Comments endpoint URL |
| `board` | object | Nested Board (see below) |
| `creator` | object | Nested User (see below) |
| `assignees` | array | Array of User objects |
| `tags` | array | Array of Tag objects |
| `steps` | array | **Only in `card show`**, not in list |

### Board Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Board ID (use for CLI commands) |
| `name` | string | Board name |
| `all_access` | boolean | All users have access |
| `created_at` | timestamp | ISO 8601 |
| `url` | string | Web URL |
| `creator` | object | Nested User |

### User Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | User ID (use for CLI commands) |
| `name` | string | Display name |
| `email_address` | string | Email |
| `role` | string | "owner", "admin", or "member" |
| `active` | boolean | Account is active |
| `created_at` | timestamp | ISO 8601 |
| `url` | string | Web URL |

### Comment Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Comment ID (use for CLI commands) |
| `body` | object | **Nested object with html and plain_text** |
| `body.html` | string | HTML content |
| `body.plain_text` | string | Plain text content |
| `created_at` | timestamp | ISO 8601 |
| `updated_at` | timestamp | ISO 8601 |
| `url` | string | Web URL |
| `reactions_url` | string | Reactions endpoint URL |
| `creator` | object | Nested User |
| `card` | object | Nested {id, url} |

### Step Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Step ID (use for CLI commands) |
| `content` | string | Step text |
| `completed` | boolean | Completion status |

### Column Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Column ID or pseudo ID ("not-now", "maybe", "done") |
| `name` | string | Display name |
| `kind` | string | "not_now", "triage", "closed", or custom |
| `pseudo` | boolean | true = built-in column |

### Tag Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Tag ID |
| `title` | string | Tag name |
| `created_at` | timestamp | ISO 8601 |
| `url` | string | Web URL |

### Reaction Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Reaction ID (use for CLI commands) |
| `content` | string | Emoji |
| `url` | string | Web URL |
| `reacter` | object | Nested User |

### Identity Schema (from `identity show`)

| Field | Type | Description |
|-------|------|-------------|
| `accounts` | array | Array of Account objects |
| `accounts[].id` | string | Account ID |
| `accounts[].name` | string | Account name |
| `accounts[].slug` | string | Account slug (use with --account) |
| `accounts[].user` | object | Your User in this account |

### Key Schema Differences

| Resource | Text Field | HTML Field |
|----------|------------|------------|
| Card | `.description` (string) | `.description_html` (string) |
| Comment | `.body.plain_text` (nested) | `.body.html` (nested) |

---

## Global Flags

All commands support:

| Flag | Description |
|------|-------------|
| `--account SLUG` | Account slug (for multi-account users) |
| `--pretty` | Pretty-print JSON output |
| `--verbose` | Show request/response details |

---

## Pagination

List commands use `--page` for pagination. There is NO `--limit` flag.

```bash
# Get first page (default)
fizzy card list --page 1

# Get specific number of results using jq
fizzy card list --page 1 | jq ''.data[:5]''

# Fetch ALL pages at once
fizzy card list --all
```

Commands supporting `--all` and `--page`:
- `board list`
- `card list`
- `search`
- `comment list`
- `tag list`
- `user list`
- `notification list`

---

## Common jq Patterns

### Reducing Output

```bash
# Card summary (most useful)
fizzy card list | jq ''[.data[] | {number, title, status, board: .board.name}]''

# First N items
fizzy card list | jq ''.data[:5]''

# Just IDs
fizzy board list | jq ''[.data[].id]''

# Specific fields from single item
fizzy card show 579 | jq ''.data | {number, title, status, golden}''

# Card with description length (description is a string, not object)
fizzy card show 579 | jq ''.data | {number, title, desc_length: (.description | length)}''
```

### Filtering

```bash
# Cards with a specific status
fizzy card list --all | jq ''[.data[] | select(.status == "published")]''

# Golden cards only
fizzy card list --indexed-by golden | jq ''[.data[] | {number, title}]''

# Cards with non-empty descriptions
fizzy card list | jq ''[.data[] | select(.description | length > 0) | {number, title}]''

# Cards with steps (must use card show, steps not in list)
fizzy card show 579 | jq ''.data.steps''
```

### Extracting Nested Data

```bash
# Comment text only (body.plain_text for comments)
fizzy comment list --card 579 | jq ''[.data[].body.plain_text]''

# Card description (just .description for cards - it''s a string)
fizzy card show 579 | jq ''.data.description''

# Step completion status
fizzy card show 579 | jq ''[.data.steps[] | {content, completed}]''
```

### Activity Analysis

```bash
# Cards with steps count (requires card show for each)
fizzy card show 579 | jq ''.data | {number, title, steps_count: (.steps | length)}''

# Comments count for a card
fizzy comment list --card 579 | jq ''.data | length''
```

---

## Command Reference

### Identity

```bash
fizzy identity show                    # Show your identity and accessible accounts
```

### Search

Quick text search across cards. Multiple words are treated as separate terms (AND).

```bash
fizzy search QUERY [flags]
  --board ID                           # Filter by board
  --assignee ID                        # Filter by assignee user ID
  --tag ID                             # Filter by tag ID
  --indexed-by LANE                    # Filter: all, closed, not_now, golden
  --sort ORDER                         # Sort: newest, oldest, or latest (default)
  --page N                             # Page number
  --all                                # Fetch all pages
```

**Examples:**
```bash
fizzy search "bug"                     # Search for "bug"
fizzy search "login error"             # Search for cards containing both "login" AND "error"
fizzy search "bug" --board BOARD_ID    # Search within a specific board
fizzy search "bug" --indexed-by closed # Include closed cards
fizzy search "feature" --sort newest   # Sort by newest first
```

### Boards

```bash
fizzy board list [--page N] [--all]
fizzy board show BOARD_ID
fizzy board create --name "Name" [--all_access true/false] [--auto_postpone_period N]
fizzy board update BOARD_ID [--name "Name"] [--all_access true/false] [--auto_postpone_period N]
fizzy board delete BOARD_ID
```

### Board Migration

Migrate boards between accounts (e.g., from personal to team account).

```bash
fizzy migrate board BOARD_ID --from SOURCE_SLUG --to TARGET_SLUG [flags]
  --include-images                       # Migrate card header images and inline attachments
  --include-comments                     # Migrate card comments
  --include-steps                        # Migrate card steps (to-do items)
  --dry-run                              # Preview migration without making changes
```

**What gets migrated:**
- Board with same name
- All columns (preserving order and colors)
- All cards with titles, descriptions, timestamps, and tags
- Card states (closed, golden, column placement)
- Optional: header images, inline attachments, comments, and steps

**What cannot be migrated:**
- Card creators (become the migrating user)
- Card numbers (new sequential numbers in target)
- Comment authors (become the migrating user)
- User assignments (team must reassign manually)

**Requirements:** You must have API access to both source and target accounts. Verify with `fizzy identity show`.

```bash
# Preview migration first
fizzy migrate board BOARD_ID --from personal --to team-account --dry-run

# Basic migration
fizzy migrate board BOARD_ID --from personal --to team-account

# Full migration with all content
fizzy migrate board BOARD_ID --from personal --to team-account \
  --include-images --include-comments --include-steps
```

### Cards

#### Listing & Viewing

```bash
fizzy card list [flags]
  --board ID                           # Filter by board
  --column ID                          # Filter by column ID or pseudo: not-yet, maybe, done
  --assignee ID                        # Filter by assignee user ID
  --tag ID                             # Filter by tag ID
  --indexed-by LANE                    # Filter: all, closed, not_now, stalled, postponing_soon, golden
  --search "terms"                     # Search by text (space-separated for multiple terms)
  --sort ORDER                         # Sort: newest, oldest, or latest (default)
  --creator ID                         # Filter by creator user ID
  --closer ID                          # Filter by user who closed the card
  --unassigned                         # Only show unassigned cards
  --created PERIOD                     # Filter by creation: today, yesterday, thisweek, lastweek, thismonth, lastmonth
  --closed PERIOD                      # Filter by closure: today, yesterday, thisweek, lastweek, thismonth, lastmonth
  --page N                             # Page number
  --all                                # Fetch all pages

fizzy card show CARD_NUMBER            # Show card details (includes steps)
```

#### Creating & Updating

```bash
fizzy card create --board ID --title "Title" [flags]
  --description "HTML"                 # Card description (HTML)
  --description_file PATH              # Read description from file
  --image SIGNED_ID                    # Header image (use signed_id from upload)
  --tag-ids "id1,id2"                  # Comma-separated tag IDs
  --created-at TIMESTAMP               # Custom created_at

fizzy card update CARD_NUMBER [flags]
  --title "Title"
  --description "HTML"
  --description_file PATH
  --image SIGNED_ID
  --created-at TIMESTAMP

fizzy card delete CARD_NUMBE

<!-- truncated -->' WHERE slug = 'neversight-fizzy-ill-md';
UPDATE skills SET content = '---
name: testing-expert
description: Expert in testing strategies for React, Next.js, and NestJS applications covering unit tests, integration tests, E2E tests, and testing best practices
---

# Testing Expert Skill

Expert in testing strategies for React, Next.js, and NestJS applications.

## When to Use This Skill

- Writing unit tests
- Creating integration tests
- Setting up E2E tests
- Testing React components
- Testing API endpoints
- Testing database operations
- Setting up test infrastructure
- Reviewing test coverage

## Project Context Discovery

1. **Scan Documentation:** Check `.agent/SYSTEM/ARCHITECTURE.md` for testing architecture
2. **Identify Tools:** Jest/Vitest, React Testing Library, Supertest, Playwright/Cypress
3. **Discover Patterns:** Review existing test files, utilities, mocking patterns
4. **Use Project-Specific Skills:** Check for `[project]-testing-expert` skill

## Core Testing Principles

### Testing Pyramid

- **Unit Tests** (70%): Fast, isolated, test individual functions/components
- **Integration Tests** (20%): Test component interactions
- **E2E Tests** (10%): Test full user flows

### Coverage Targets

- Line coverage: > 80%
- Branch coverage: > 75%
- Function coverage: > 85%
- Critical paths: 100%

### Test Organization

```
src/
  users/
    users.controller.ts
    users.controller.spec.ts  # Unit tests
    users.service.ts
    users.service.spec.ts
  __tests__/
    integration/
    e2e/
```

### Test Quality (AAA Pattern)

```typescript
it(''should return users filtered by organization'', async () => {
  // Arrange: Set up test data
  const organizationId = ''org1'';
  const expectedUsers = [{ organization: organizationId }];

  // Act: Execute the code being tested
  const result = await service.findAll(organizationId);

  // Assert: Verify the result
  expect(result).toEqual(expectedUsers);
});
```

## Good Tests Are

- Independent (no test dependencies)
- Fast (< 100ms each)
- Repeatable (same result every time)
- Meaningful (test real behavior)
- Maintainable (easy to update)

## Testing Best Practices Summary

1. **Test Isolation:** Each test independent, clean up after
2. **Meaningful Tests:** Test behavior, not implementation
3. **Mocking Strategy:** Mock external dependencies, not what you''re testing
4. **Test Data:** Use factories, keep data minimal, clean up
5. **Coverage:** High coverage, focus on critical paths

## Integration

| Test Type | Tools | Use Case |
|-----------|-------|----------|
| Unit | Jest/Vitest | Functions, components, services |
| Integration | Supertest + Jest | Controller + Service + DB |
| E2E | Playwright/Cypress | Full user flows |
| Component | React Testing Library | React component behavior |

---

**For complete React Testing Library examples, hook testing, Next.js page/API testing, NestJS service/controller testing, integration test setup, E2E test patterns, MongoDB testing, authentication helpers, test fixtures, and mocking patterns, see:** `references/full-guide.md`
' WHERE slug = 'neversight-testing-expert';
UPDATE skills SET content = '---
name: web-component-design
description: Master React, Vue, and Svelte component patterns including CSS-in-JS, composition strategies, and reusable component architecture. Use when building UI component libraries, designing component APIs, or implementing frontend design systems.
---

# Web Component Design

Build reusable, maintainable UI components using modern frameworks with clean composition patterns and styling approaches.

## When to Use This Skill

- Designing reusable component libraries or design systems
- Implementing complex component composition patterns
- Choosing and applying CSS-in-JS solutions
- Building accessible, responsive UI components
- Creating consistent component APIs across a codebase
- Refactoring legacy components into modern patterns
- Implementing compound components or render props

## Core Concepts

### 1. Component Composition Patterns

**Compound Components**: Related components that work together

```tsx
// Usage
<Select value={value} onChange={setValue}>
  <Select.Trigger>Choose option</Select.Trigger>
  <Select.Options>
    <Select.Option value="a">Option A</Select.Option>
    <Select.Option value="b">Option B</Select.Option>
  </Select.Options>
</Select>
```

**Render Props**: Delegate rendering to parent

```tsx
<DataFetcher url="/api/users">
  {({ data, loading, error }) =>
    loading ? <Spinner /> : <UserList users={data} />
  }
</DataFetcher>
```

**Slots (Vue/Svelte)**: Named content injection points

```vue
<template>
  <Card>
    <template #header>Title</template>
    <template #content>Body text</template>
    <template #footer><Button>Action</Button></template>
  </Card>
</template>
```

### 2. CSS-in-JS Approaches

| Solution              | Approach               | Best For                          |
| --------------------- | ---------------------- | --------------------------------- |
| **Tailwind CSS**      | Utility classes        | Rapid prototyping, design systems |
| **CSS Modules**       | Scoped CSS files       | Existing CSS, gradual adoption    |
| **styled-components** | Template literals      | React, dynamic styling            |
| **Emotion**           | Object/template styles | Flexible, SSR-friendly            |
| **Vanilla Extract**   | Zero-runtime           | Performance-critical apps         |

### 3. Component API Design

```tsx
interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  isDisabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}
```

**Principles**:

- Use semantic prop names (`isLoading` vs `loading`)
- Provide sensible defaults
- Support composition via `children`
- Allow style overrides via `className` or `style`

## Quick Start: React Component with Tailwind

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-blue-600 text-white hover:bg-blue-700",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
        ghost: "hover:bg-gray-100 hover:text-gray-900",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

interface ButtonProps
  extends
    ComponentPropsWithoutRef<"button">,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Spinner className="mr-2 h-4 w-4" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
```

## Framework Patterns

### React: Compound Components

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";

interface AccordionContextValue {
  openItems: Set<string>;
  toggle: (id: string) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordion() {
  const context = useContext(AccordionContext);
  if (!context) throw new Error("Must be used within Accordion");
  return context;
}

export function Accordion({ children }: { children: ReactNode }) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div className="divide-y">{children}</div>
    </AccordionContext.Provider>
  );
}

Accordion.Item = function AccordionItem({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const { openItems, toggle } = useAccordion();
  const isOpen = openItems.has(id);

  return (
    <div>
      <button onClick={() => toggle(id)} className="w-full text-left py-3">
        {title}
      </button>
      {isOpen && <div className="pb-3">{children}</div>}
    </div>
  );
};
```

### Vue 3: Composables

```vue
<script setup lang="ts">
import { ref, computed, provide, inject, type InjectionKey } from "vue";

interface TabsContext {
  activeTab: Ref<string>;
  setActive: (id: string) => void;
}

const TabsKey: InjectionKey<TabsContext> = Symbol("tabs");

// Parent component
const activeTab = ref("tab-1");
provide(TabsKey, {
  activeTab,
  setActive: (id: string) => {
    activeTab.value = id;
  },
});

// Child component usage
const tabs = inject(TabsKey);
const isActive = computed(() => tabs?.activeTab.value === props.id);
</script>
```

### Svelte 5: Runes

```svelte
<script lang="ts">
  interface Props {
    variant?: ''primary'' | ''secondary'';
    size?: ''sm'' | ''md'' | ''lg'';
    onclick?: () => void;
    children: import(''svelte'').Snippet;
  }

  let { variant = ''primary'', size = ''md'', onclick, children }: Props = $props();

  const classes = $derived(
    `btn btn-${variant} btn-${size}`
  );
</script>

<button class={classes} {onclick}>
  {@render children()}
</button>
```

## Best Practices

1. **Single Responsibility**: Each component does one thing well
2. **Prop Drilling Prevention**: Use context for deeply nested data
3. **Accessible by Default**: Include ARIA attributes, keyboard support
4. **Controlled vs Uncontrolled**: Support both patterns when appropriate
5. **Forward Refs**: Allow parent access to DOM nodes
6. **Memoization**: Use `React.memo`, `useMemo` for expensive renders
7. **Error Boundaries**: Wrap components that may fail

## Common Issues

- **Prop Explosion**: Too many props - consider composition instead
- **Style Conflicts**: Use scoped styles or CSS Modules
- **Re-render Cascades**: Profile with React DevTools, memo appropriately
- **Accessibility Gaps**: Test with screen readers and keyboard navigation
- **Bundle Size**: Tree-shake unused component variants

## Resources

- [React Component Patterns](https://reactpatterns.com/)
- [Vue Composition API Guide](https://vuejs.org/guide/reusability/composables.html)
- [Svelte Component Documentation](https://svelte.dev/docs/svelte-components)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [shadcn/ui Components](https://ui.shadcn.com/)
' WHERE slug = 'neversight-web-component-design';
UPDATE skills SET content = '---
name: forms-router
description: Router for web form development. Use when creating forms, handling validation, user input, or data entry across React, Vue, or vanilla JavaScript. Routes to 7 specialized skills for accessibility, validation, security, UX patterns, and framework-specific implementations. Start here for form projects.
---

# Forms Router

Routes to 7 specialized skills based on task requirements.

## Routing Protocol

1. **Classify** — Identify framework + form type
2. **Match** — Apply signal matching rules below
3. **Combine** — Production forms need 3-4 skills minimum
4. **Load** — Read matched SKILL.md files before coding

## Quick Route

### Tier 1: Core (Always Include)
| Need | Skill | Signals |
|------|-------|---------|
| WCAG compliance, ARIA | `form-accessibility` | accessible, ARIA, screen reader, keyboard, focus, a11y |
| Zod schemas, timing | `form-validation` | validate, Zod, schema, error, required, pattern |
| Autocomplete, CSRF, XSS | `form-security` | autocomplete, password manager, CSRF, XSS, sanitize |

### Tier 2: Framework
| Need | Skill | Signals |
|------|-------|---------|
| React Hook Form / TanStack | `form-react` | React, useForm, RHF, TanStack, formState |
| VeeValidate / Vuelidate | `form-vue` | Vue, VeeValidate, Vuelidate, v-model |
| No framework | `form-vanilla` | vanilla, plain JS, native, constraint validation |

### Tier 3: Enhanced UX
| Need | Skill | Signals |
|------|-------|---------|
| Wizards, chunking, conditionals | `form-ux-patterns` | multi-step, wizard, progressive, conditional, stepper |

## Signal Priority

When multiple signals present:
1. **Framework explicit** — React/Vue/vanilla determines Tier 2 choice
2. **Auth context** — Login/registration triggers `form-security` priority
3. **Complexity** — Wizard/multi-step triggers `form-ux-patterns`
4. **Default** — Always include all Tier 1 skills

## Common Combinations

### Standard Production Form (4 skills)
```
form-accessibility → WCAG, ARIA binding
form-validation → Zod schemas, timing
form-react → RHF integration
form-security → autocomplete attributes
```

### Secure Auth Form (4 skills)
```
form-security → autocomplete, CSRF (priority)
form-accessibility → focus, error announcements
form-validation → auth schema
form-react → controlled submission
```

### Multi-Step Wizard (4 skills)
```
form-ux-patterns → chunking, navigation
form-validation → per-step validation
form-accessibility → focus on step change
form-react → FormProvider context
```

### Framework-Free Form (3 skills)
```
form-vanilla → Constraint Validation API
form-accessibility → manual ARIA
form-security → autocomplete
```

## Decision Table

| Framework | Form Type | Skills |
|-----------|-----------|--------|
| React | Standard | accessibility + validation + security + react |
| React | Auth | security + accessibility + validation + react |
| React | Wizard | ux-patterns + validation + accessibility + react |
| Vue | Standard | accessibility + validation + security + vue |
| Vue | Complex | accessibility + validation + ux-patterns + vue |
| None | Any | vanilla + accessibility + security |

## Core Principles (All Skills)

**Schema-first**: Define Zod schema → infer TypeScript types  
**Timing**: Reward early (✓ on valid), punish late (✗ on blur only)  
**Autocomplete**: Never optional for auth forms  
**Chunking**: Max 5-7 fields per logical group

## Fallback

- **No framework stated** → Ask: "React, Vue, or vanilla JS?"
- **Ambiguous complexity** → Start with Tier 1 + framework skill
- **Missing context** → Default to `form-react` (most common)

## Reference

See `references/integration-guide.md` for complete wiring patterns and code examples.
' WHERE slug = 'neversight-forms-router';
UPDATE skills SET content = '---
name: thesys-generative-ui
description: |
  Production-ready skill for integrating TheSys C1 Generative UI API into React applications. This skill should be used when building AI-powered interfaces that stream interactive components (forms, charts, tables) instead of plain text responses. Covers complete integration patterns for Vite+React, Next.js, and Cloudflare Workers with OpenAI, Anthropic Claude, and Cloudflare Workers AI. Includes tool calling with Zod schemas, theming, thread management, and production deployment. Prevents 12+ common integration errors and provides working templates for chat interfaces, data visualization, and dynamic forms. Use this skill when implementing conversational UIs, AI assistants, search interfaces, or any application requiring real-time generative user interfaces with streaming LLM responses.

  Keywords: TheSys C1, TheSys Generative UI, @thesysai/genui-sdk, generative UI, AI UI, streaming UI components, interactive components, AI forms, AI charts, AI tables, conversational UI, AI assistants UI, React generative UI, Vite generative UI, Next.js generative UI, Cloudflare Workers generative UI, OpenAI generative UI, Claude generative UI, Anthropic UI, Cloudflare Workers AI UI, tool calling UI, Zod schemas UI, thread management, theming UI, chat interface, data visualization, dynamic forms, streaming LLM UI
license: MIT
metadata:
  version: "1.0.0"
  package: "@thesysai/genui-sdk"
  package_version: "0.6.40"
  last_verified: "2025-10-26"
  production_tested: true
  token_savings: "~65-70%"
  errors_prevented: 12
---

# TheSys Generative UI Integration

Complete skill for building AI-powered interfaces with TheSys C1 Generative UI API. Convert LLM responses into streaming, interactive React components.

---

## What is TheSys C1?

**TheSys C1** is a Generative UI API that transforms Large Language Model (LLM) responses into live, interactive React components instead of plain text. Rather than displaying walls of text, your AI applications can stream forms, charts, tables, search results, and custom UI elements in real-time.

### Key Innovation

Traditional LLM applications return text that developers must manually convert into UI:
```
LLM → Text Response → Developer Parses → Manual UI Code → Display
```

TheSys C1 eliminates this manual step:
```
LLM → C1 API → Interactive React Components → Display
```

### Real-World Impact

- **83% more engaging** - Users prefer interactive components over text walls
- **10x faster development** - No manual text-to-UI conversion
- **80% cheaper** - Reduced development time and maintenance
- **Production-ready** - Used by teams building AI-native products

---

## When to Use This Skill

Use this skill when building:

1. **Chat Interfaces with Rich UI**
   - Conversational interfaces that need more than text
   - Customer support chatbots with forms and actions
   - AI assistants that show data visualizations

2. **Data Visualization Applications**
   - Analytics dashboards with AI-generated charts
   - Business intelligence tools with dynamic tables
   - Search interfaces with structured results

3. **Dynamic Form Generation**
   - E-commerce product configurators
   - Multi-step workflows driven by AI
   - Data collection with intelligent forms

4. **AI Copilots and Assistants**
   - Developer tools with code snippets and docs
   - Educational platforms with interactive lessons
   - Research tools with citations and references

5. **Search and Discovery**
   - Semantic search with structured results
   - Document analysis with highlighted findings
   - Knowledge bases with interactive answers

### This Skill Prevents These Errors

- ❌ Empty agent responses from incorrect streaming setup
- ❌ Models ignoring system prompts due to message array issues
- ❌ Version compatibility errors between SDK and API
- ❌ Themes not applying without ThemeProvider
- ❌ Streaming failures from improper response transformation
- ❌ Tool calling bugs from invalid Zod schemas
- ❌ Thread state loss from missing persistence
- ❌ CSS conflicts from import order issues
- ❌ TypeScript errors from outdated type definitions
- ❌ CORS failures from missing headers
- ❌ Rate limit crashes without retry logic
- ❌ Authentication token errors from environment issues

---

## Quick Start by Framework

### Vite + React Setup

**Most flexible setup for custom backends (your preferred stack).**

#### 1. Install Dependencies

```bash
npm install @thesysai/genui-sdk @crayonai/react-ui @crayonai/react-core @crayonai/stream
npm install openai zod
```

#### 2. Create Chat Component

**File**: `src/App.tsx`

```typescript
import "@crayonai/react-ui/styles/index.css";
import { ThemeProvider, C1Component } from "@thesysai/genui-sdk";
import { useState } from "react";

export default function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [c1Response, setC1Response] = useState("");
  const [question, setQuestion] = useState("");

  const makeApiCall = async (query: string) => {
    setIsLoading(true);
    setC1Response("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: query }),
      });

      const data = await response.json();
      setC1Response(data.response);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>AI Assistant</h1>

      <form onSubmit={(e) => {
        e.preventDefault();
        makeApiCall(question);
      }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask me anything..."
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Processing..." : "Send"}
        </button>
      </form>

      {c1Response && (
        <ThemeProvider>
          <C1Component
            c1Response={c1Response}
            isStreaming={isLoading}
            updateMessage={(message) => setC1Response(message)}
            onAction={({ llmFriendlyMessage }) => {
              if (!isLoading) {
                makeApiCall(llmFriendlyMessage);
              }
            }}
          />
        </ThemeProvider>
      )}
    </div>
  );
}
```

#### 3. Configure Backend API (Express Example)

```typescript
import express from "express";
import OpenAI from "openai";
import { transformStream } from "@crayonai/stream";

const app = express();
app.use(express.json());

const client = new OpenAI({
  baseURL: "https://api.thesys.dev/v1/embed",
  apiKey: process.env.THESYS_API_KEY,
});

app.post("/api/chat", async (req, res) => {
  const { prompt } = req.body;

  const stream = await client.chat.completions.create({
    model: "c1/openai/gpt-5/v-20250930", // or any C1-compatible model
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt },
    ],
    stream: true,
  });

  // Transform OpenAI stream to C1 response
  const c1Stream = transformStream(stream, (chunk) => {
    return chunk.choices[0]?.delta?.content || "";
  });

  res.json({ response: await streamToString(c1Stream) });
});

async function streamToString(stream: ReadableStream) {
  const reader = stream.getReader();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += value;
  }

  return result;
}

app.listen(3000);
```

---

### Next.js App Router Setup

**Most popular framework, full-stack with API routes.**

#### 1. Install Dependencies

```bash
npm install @thesysai/genui-sdk @crayonai/react-ui @crayonai/react-core
npm install openai
```

#### 2. Create Chat Page Component

**File**: `app/page.tsx`

```typescript
"use client";

import { C1Chat } from "@thesysai/genui-sdk";
import "@crayonai/react-ui/styles/index.css";

export default function Home() {
  return (
    <div className="min-h-screen">
      <C1Chat apiUrl="/api/chat" />
    </div>
  );
}
```

#### 3. Create API Route Handler

**File**: `app/api/chat/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { transformStream } from "@crayonai/stream";

const client = new OpenAI({
  baseURL: "https://api.thesys.dev/v1/embed",
  apiKey: process.env.THESYS_API_KEY,
});

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();

  const stream = await client.chat.completions.create({
    model: "c1/openai/gpt-5/v-20250930",
    messages: [
      { role: "system", content: "You are a helpful AI assistant." },
      { role: "user", content: prompt },
    ],
    stream: true,
  });

  // Transform to C1-compatible stream
  const responseStream = transformStream(stream, (chunk) => {
    return chunk.choices[0]?.delta?.content || "";
  }) as ReadableStream<string>;

  return new NextResponse(responseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
```

**That''s it!** You now have a working Generative UI chat interface.

---

### Cloudflare Workers + Static Assets Setup

**Your stack: Workers backend with Vite+React frontend.**

#### 1. Create Worker Backend (Hono)

**File**: `backend/src/index.ts`

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("/*", cors());

app.post("/api/chat", async (c) => {
  const { prompt } = await c.req.json();

  // Use Cloudflare Workers AI or proxy to OpenAI
  const response = await fetch("https://api.thesys.dev/v1/embed/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${c.env.THESYS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "c1/openai/gpt-5/v-20250930",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt },
      ],
      stream: false, // or handle streaming
    }),
  });

  const data = await response.json();
  return c.json(data);
});

export default app;
```

#### 2. Frontend Setup (Same as Vite+React)

Use the Vite+React example above, but configure API calls to your Worker endpoint.

#### 3. Wrangler Configuration

**File**: `wrangler.jsonc`

```jsonc
{
  "name": "thesys-chat-worker",
  "compatibility_date": "2025-10-26",
  "main": "backend/src/index.ts",
  "vars": {
    "ENVIRONMENT": "production"
  },
  "assets": {
    "directory": "dist",
    "binding": "ASSETS"
  }
}
```

Add `THESYS_API_KEY` as a secret:
```bash
npx wrangler secret put THESYS_API_KEY
```

---

## Core Components

### `<C1Chat>` - Pre-built Chat Component

**When to use**: Building conversational interfaces with minimal setup.

The `C1Chat` component is a fully-featured chat UI with built-in:
- Message history
- Streaming responses
- Thread management
- Loading states
- Error handling
- Responsive design

#### Basic Usage

```typescript
import { C1Chat } from "@thesysai/genui-sdk";
import "@crayonai/react-ui/styles/index.css";

export default function App() {
  return (
    <C1Chat
      apiUrl="/api/chat"
      agentName="My AI Assistant"
      logoUrl="https://example.com/logo.png"
    />
  );
}
```

#### Key Props

- **`apiUrl`** (required) - Backend endpoint for chat completions
- **`agentName`** - Display name for the AI agent
- **`logoUrl`** - Logo/avatar for the agent
- **`theme`** - Custom theme object (see Theming section)
- **`threadManager`** - For multi-thread support (advanced)
- **`threadListManager`** - For thread list UI (advanced)
- **`customizeC1`** - Custom components (footer, thinking states)

#### With Theme

```typescript
import { C1Chat } from "@thesysai/genui-sdk";
import { themePresets } from "@crayonai/react-ui";

<C1Chat
  apiUrl="/api/chat"
  theme={themePresets.candy} // or ''default'', or custom object
/>
```

---

### `<C1Component>` - Custom Integration Component

**When to use**: Need full control over state management and UI layout.

The `C1Component` is the low-level renderer. You handle:
- Fetching data
- Managing state
- Layout structure
- Error boundaries

#### Basic Usage

```typescript
import { C1Component, ThemeProvider } from "@thesysai/genui-sdk";
import "@crayonai/react-ui/styles/index.css";

const [c1Response, setC1Response] = useState("");
const [isStreaming, setIsStreaming] = useState(false);

// ... fetch logic

return (
  <ThemeProvider>
    <C1Component
      c1Response={c1Response}
      isStreaming={isStreaming}
      updateMessage={(message) => setC1Response(message)}
      onAction={({ llmFriendlyMessage }) => {
        // Handle interactive actions (button clicks, form submissions)
        console.log("User action:", llmFriendlyMessage);
        // Make new API call with llmFriendlyMessage
      }}
    />
  </ThemeProvider>
);
```

#### Key Props

- **`c1Response`** (required) - The C1 API response string
- **`isStreaming`** - Whether response is still streaming (shows loading indicator)
- **`updateMessage`** - Callback for response updates during streaming
- **`onAction`** - Callback for user interactions with generated UI
  - `llmFriendlyMessage`: Pre-formatted message to send back to LLM
  - `rawAction`: Raw action data from the component

#### Important: Must Wrap with ThemeProvider

```typescript
// ❌ Wrong - theme won''t apply
<C1Component c1Response={response} />

// ✅ Correct
<ThemeProvider>
  <C1Component c1Response={response} />
</ThemeProvider>
```

---

### `<ThemeProvider>` - Theming and Customization

**When to use**: Always wrap `<C1Component>` or customize `<C1Chat>` appearance.

#### Theme Presets

TheSys includes pre-built themes:

```typescript
import { themePresets } from "@crayonai/react-ui";

// Available presets:
// - themePresets.default
// - themePresets.candy
// ... (check docs for full list)

<C1Chat theme={themePresets.candy} />
```

#### Dark Mode Support

```typescript
import { useSystemTheme } from "./hooks/useSystemTheme"; // custom hook

export default function App() {
  const systemTheme = useSystemTheme(); // ''light'' | ''dark''

  return (
    <C1Chat
      apiUrl="/api/chat"
      theme={{ ...themePresets.default, mode: systemTheme }}
    />
  );
}
```

#### Custom Theme Object

```typescript
const customTheme = {
  mode: "dark", // ''light'' | ''dark'' | ''system''
  colors: {
    primary: "#3b82f6",
    secondary: "#8b5cf6",
    background: "#1f2937",
    foreground: "#f9fafb",
    // ... more colors
  },
  fonts: {
    body: "Inter, sans-serif",
    heading: "Poppins, sans-serif",
  },
  borderRadius: "12px",
  spacing: {
    base: "16px",
  },
};

<C1Chat theme={customTheme} />
```

#### CSS Overrides

Create a `custom.css` file:

```css
/* Override specific component styles */
.c1-chat-container {
  max-width: 900px;
  margin: 0 aut

<!-- truncated -->' WHERE slug = 'neversight-thesys-generative-ui-ill-md';
UPDATE skills SET content = '---
name: example-react
description: Patterns for using Helios with React. Use when building compositions in a React environment.
---

# React Composition Patterns

Integrate Helios into React components using hooks for state management and Refs for canvas access.

## Quick Start

### 1. Create `useVideoFrame` Hook

This hook subscribes to Helios and returns the current frame, triggering re-renders.

```javascript
// hooks/useVideoFrame.js
import { useState, useEffect } from ''react'';

export function useVideoFrame(helios) {
  const [frame, setFrame] = useState(helios.currentFrame.peek());

  useEffect(() => {
    // Subscribe to updates
    const unsubscribe = helios.subscribe((state) => {
      setFrame(state.currentFrame);
    });
    return unsubscribe;
  }, [helios]);

  return frame;
}
```

### 2. Create Composition Component

```jsx
// App.jsx
import React, { useRef, useEffect } from ''react'';
import { Helios } from ''@helios-project/core'';
import { useVideoFrame } from ''./hooks/useVideoFrame'';

// Initialize Singleton (outside component to persist across re-renders)
const helios = new Helios({
  duration: 10,
  fps: 30
});
helios.bindToDocumentTimeline();

// Expose for Renderer/Player
if (typeof window !== ''undefined'') window.helios = helios;

export default function App() {
  const canvasRef = useRef(null);
  const frame = useVideoFrame(helios);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext(''2d'');
    if (!ctx) return;

    const { width, height } = canvasRef.current;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw based on frame
    const progress = frame / (helios.duration * helios.fps);
    ctx.fillStyle = ''#61dafb'';
    ctx.fillRect(progress * width, height / 2 - 50, 100, 100);

  }, [frame]); // Re-run draw when frame changes

  return <canvas ref={canvasRef} width={1920} height={1080} />;
}
```

## Optimization

For complex scenes, avoid React state updates for every frame (which triggers full component re-render). Instead, use a `useRef` to hold the frame and an animation loop, or update the canvas imperatively inside `subscribe`.

### Imperative Pattern (High Performance)

```jsx
useEffect(() => {
  const ctx = canvasRef.current.getContext(''2d'');

  const unsubscribe = helios.subscribe((state) => {
    // Draw directly without triggering React render
    drawScene(ctx, state.currentFrame);
  });

  return unsubscribe;
}, []);
```

## Source Files

- Example: `examples/react-canvas-animation/`
' WHERE slug = 'bintzgavin-example-react';
UPDATE skills SET content = '---
name: react-flow-usage
description: Comprehensive React Flow (@xyflow/react) patterns and best practices for building node-based UIs, workflow editors, and interactive diagrams. Use when working with React Flow for (1) building flow editors or node-based interfaces, (2) creating custom nodes and edges, (3) implementing drag-and-drop workflows, (4) optimizing performance for large graphs, (5) managing flow state and interactions, (6) implementing auto-layout or positioning, or (7) TypeScript integration with React Flow.
license: MIT
metadata:
  author: xyflow Team
  version: "1.0.0"
  package: "@xyflow/react"
---

# React Flow Usage Guide

Comprehensive patterns and best practices for building production-ready node-based UIs with React Flow (@xyflow/react v12+).

## When to Use This Skill

Apply these guidelines when:
- Building workflow editors, flow diagrams, or node-based interfaces
- Creating custom node or edge components
- Implementing drag-and-drop functionality for visual programming
- Optimizing performance for graphs with 100+ nodes
- Managing flow state, save/restore, or undo/redo
- Implementing auto-layout with dagre, elkjs, or custom algorithms
- Integrating React Flow with TypeScript

## Rule Categories by Priority

| Priority | Category | Focus | Prefix |
|----------|----------|-------|--------|
| 1 | Setup & Configuration | CRITICAL | `setup-` |
| 2 | Performance Optimization | CRITICAL | `perf-` |
| 3 | Node Patterns | HIGH | `node-` |
| 4 | Edge Patterns | HIGH | `edge-` |
| 5 | State Management | HIGH | `state-` |
| 6 | Hooks Usage | MEDIUM | `hook-` |
| 7 | Layout & Positioning | MEDIUM | `layout-` |
| 8 | Interaction Patterns | MEDIUM | `interaction-` |
| 9 | TypeScript Integration | MEDIUM | `typescript-` |

## Quick Start Pattern

```tsx
import { useCallback } from ''react'';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge
} from ''@xyflow/react'';
import ''@xyflow/react/dist/style.css'';

const initialNodes = [
  { id: ''1'', position: { x: 0, y: 0 }, data: { label: ''Node 1'' } },
];

const initialEdges = [
  { id: ''e1-2'', source: ''1'', target: ''2'' },
];

// Define outside component or use useMemo
const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div style={{ width: ''100%'', height: ''100vh'' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
```

## Core Concepts Overview

### Node Structure
- `id`: Unique identifier (required)
- `position`: `{ x: number, y: number }` (required)
- `data`: Custom data object (required)
- `type`: Built-in or custom type
- `style`, `className`: Styling
- `draggable`, `selectable`, `connectable`: Interaction controls
- `parentId`: For nested/grouped nodes
- `extent`: Movement boundaries

### Edge Structure
- `id`: Unique identifier (required)
- `source`: Source node id (required)
- `target`: Target node id (required)
- `sourceHandle`, `targetHandle`: Specific handle ids
- `type`: ''default'' | ''straight'' | ''step'' | ''smoothstep'' | custom
- `animated`: Boolean for animation
- `label`: String or React component
- `markerStart`, `markerEnd`: Arrow markers

### Handle Usage
- Position: `Position.Top | Bottom | Left | Right`
- Type: `''source'' | ''target''`
- Multiple handles per node supported
- Use unique `id` prop for multiple handles

## Essential Patterns

### Custom Nodes
```tsx
import { memo } from ''react'';
import { Handle, Position, NodeProps } from ''@xyflow/react'';

const CustomNode = memo(({ data, selected }: NodeProps) => {
  return (
    <div className={`custom-node ${selected ? ''selected'' : ''''}`}>
      <Handle type="target" position={Position.Top} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

// IMPORTANT: Define outside component
const nodeTypes = { custom: CustomNode };
```

### Custom Edges
```tsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath, EdgeProps } from ''@xyflow/react'';

function CustomEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} />
      <EdgeLabelRenderer>
        <div style={{
          position: ''absolute'',
          transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
        }}>
          Custom Label
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
```

### Performance Optimization
```tsx
// 1. Memoize node/edge types (define outside component)
const nodeTypes = useMemo(() => ({ custom: CustomNode }), []);

// 2. Memoize callbacks
const onConnect = useCallback((params) =>
  setEdges((eds) => addEdge(params, eds)), [setEdges]
);

// 3. Use simple edge types for large graphs
const edgeType = nodes.length > 100 ? ''straight'' : ''smoothstep'';

// 4. Avoid unnecessary re-renders in custom components
const CustomNode = memo(({ data }) => <div>{data.label}</div>);
```

## Key Hooks

- `useReactFlow()` - Access flow instance methods (getNodes, setNodes, fitView, etc.)
- `useNodesState()` / `useEdgesState()` - Managed state with change handlers
- `useNodes()` / `useEdges()` - Reactive access to current nodes/edges
- `useNodesData(id)` - Get specific node data (more performant than useNodes)
- `useHandleConnections()` - Get connections for a handle
- `useConnection()` - Track connection in progress
- `useStore()` - Direct store access (use sparingly)

## Common Patterns

### Drag and Drop
```tsx
const onDrop = useCallback((event) => {
  event.preventDefault();
  const type = event.dataTransfer.getData(''application/reactflow'');
  const position = screenToFlowPosition({
    x: event.clientX,
    y: event.clientY,
  });

  setNodes((nds) => nds.concat({
    id: getId(),
    type,
    position,
    data: { label: `${type} node` },
  }));
}, [screenToFlowPosition]);
```

### Save and Restore
```tsx
const { toObject } = useReactFlow();

// Save
const flow = toObject();
localStorage.setItem(''flow'', JSON.stringify(flow));

// Restore
const flow = JSON.parse(localStorage.getItem(''flow''));
setNodes(flow.nodes || []);
setEdges(flow.edges || []);
setViewport(flow.viewport);
```

### Connection Validation
```tsx
const isValidConnection = useCallback((connection) => {
  // Prevent self-connections
  if (connection.source === connection.target) return false;

  // Custom validation logic
  return true;
}, []);
```

## Detailed Rules

For comprehensive patterns and best practices, see individual rule files in the `rules/` directory organized by category:

```
rules/setup-*.md          - Critical setup patterns
rules/perf-*.md           - Performance optimization
rules/node-*.md           - Node customization patterns
rules/edge-*.md           - Edge handling patterns
rules/state-*.md          - State management
rules/hook-*.md           - Hooks usage
rules/layout-*.md         - Layout and positioning
rules/interaction-*.md    - User interactions
rules/typescript-*.md     - TypeScript integration
```

## Full Compiled Documentation

For the complete guide with all rules and examples expanded: see `AGENTS.md`

## Scraped Documentation Reference

Comprehensive scraped documentation from reactflow.dev is available in `scraped/`:

- **Learn**: `scraped/learn-concepts/`, `scraped/learn-customization/`, `scraped/learn-advanced/`
- **API**: `scraped/api-hooks/`, `scraped/api-types/`, `scraped/api-utils/`, `scraped/api-components/`
- **Examples**: `scraped/examples-nodes/`, `scraped/examples-edges/`, `scraped/examples-interaction/`, `scraped/examples-layout/`
- **UI Components**: `scraped/ui-components/`
- **Tutorials**: `scraped/learn-tutorials/`
- **Troubleshooting**: `scraped/learn-troubleshooting/`

## Common Issues

1. **Couldn''t create edge** - Add `onConnect` handler
2. **Nodes not draggable** - Check `nodesDraggable` prop
3. **CSS not loading** - Import `@xyflow/react/dist/style.css`
4. **useReactFlow outside provider** - Wrap with `<ReactFlowProvider>`
5. **Performance issues** - See Performance category rules
6. **TypeScript errors** - Use proper generic types `useReactFlow<NodeType, EdgeType>()`

## References

- Official Documentation: https://reactflow.dev
- GitHub: https://github.com/xyflow/xyflow
- Package: `@xyflow/react` (npm)
- Examples: https://reactflow.dev/examples
- API Reference: https://reactflow.dev/api-reference
' WHERE slug = 'neversight-react-flow-usage';