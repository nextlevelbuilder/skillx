UPDATE skills SET content = '---
name: vue
description: Use when editing .vue files, creating Vue 3 components, writing composables, or testing Vue code - provides Composition API patterns, props/emits best practices, VueUse integration, and reactive destructuring guidance
license: MIT
---

# Vue 3 Development

Reference for Vue 3 Composition API patterns, component architecture, and testing practices.

**Current stable:** Vue 3.5+ with enhanced reactivity performance (-56% memory, 10x faster array tracking), new SSR features, and improved developer experience.

## Overview

Progressive reference system for Vue 3 projects. Load only files relevant to current task to minimize context usage (~250 tokens base, 500-1500 per sub-file).

## When to Use

**Use this skill when:**

- Writing `.vue` components
- Creating composables (`use*` functions)
- Building client-side utilities
- Testing Vue components/composables

**Use `nuxt` skill instead for:**

- Server routes, API endpoints
- File-based routing, middleware
- Nuxt-specific patterns

**For styled UI components:** use `nuxt-ui` skill
**For headless accessible components:** use `reka-ui` skill
**For VueUse composables:** use `vueuse` skill

## Quick Reference

| Working on...            | Load file                  |
| ------------------------ | -------------------------- |
| `.vue` in `components/`  | references/components.md   |
| File in `composables/`   | references/composables.md  |
| File in `utils/`         | references/utils-client.md |
| `.spec.ts` or `.test.ts` | references/testing.md      |
| TypeScript patterns      | references/typescript.md   |
| Vue Router typing        | references/router.md       |

## Loading Files

**Load one file at a time based on file context:**

- Component work → [references/components.md](references/components.md)
- Composable work → [references/composables.md](references/composables.md)
- Utils work → [references/utils-client.md](references/utils-client.md)
- Testing → [references/testing.md](references/testing.md)
- TypeScript → [references/typescript.md](references/typescript.md)
- Vue Router → [references/router.md](references/router.md)

**DO NOT load all files at once** - wastes context on irrelevant patterns.

## Available Guidance

**[references/components.md](references/components.md)** - Props with reactive destructuring, emits patterns, defineModel for v-model, slots shorthand

**[references/composables.md](references/composables.md)** - Composition API structure, VueUse integration, lifecycle hooks, async patterns, reactivity gotchas

**[references/utils-client.md](references/utils-client.md)** - Pure functions, formatters, validators, transformers, when NOT to use utils

**[references/testing.md](references/testing.md)** - Vitest + @vue/test-utils, component testing, composable testing, router mocking

**[references/typescript.md](references/typescript.md)** - InjectionKey for provide/inject, vue-tsc strict templates, tsconfig settings, generic components

**[references/router.md](references/router.md)** - Route meta types, typed params with unplugin-vue-router, scroll behavior, navigation guards

## Examples

Working examples in `resources/examples/`:

- `component-example.vue` - Full component with all patterns
- `composable-example.ts` - Reusable composition function
' WHERE slug = 'neversight-vue-ill-md';
UPDATE skills SET content = '---
name: widget-studio
description: Integrates Widget Studio SDK into web projects. Supports HTML, React, Next.js, Shopify, and WordPress. Use this skill when the user wants to add Widget Studio, WidgetX, or widget-studio.weez.boo to their project.
---

# Widget Studio Integration

This skill helps you integrate Widget Studio SDK into web projects.

## Prerequisites

Before starting the integration, you MUST ask the user for their **Site Key**. This is a required public key that looks like: `site_01702db01234588145cb48be580d575`

**Always ask:** "What is your Widget Studio site key?"

## ⚠️ CRITICAL: Code Implementation Rules

**DO NOT SUMMARIZE OR PARAPHRASE THE CODE SNIPPETS.**

When implementing Widget Studio integration:

1. **Copy code exactly as shown** - Do not simplify, shorten, or "optimize" the code examples
2. **Include ALL parts** - Every line in the code snippets is intentional and required
3. **Preserve structure** - Keep the exact formatting, variable names, and initialization patterns
4. **No shortcuts** - Do not skip the double-init prevention logic for Shopify/WordPress
5. **No "equivalent" alternatives** - Use the exact patterns provided, not similar approaches

### Why This Matters

- The SDK initialization order is specific and tested
- The `__widgetx_inited` flag prevents real production bugs
- TypeScript declarations must be exact for proper type checking
- Script loading strategies (`async`, `afterInteractive`) are performance-optimized

### ❌ DON''T DO THIS:
- "Here''s a simplified version..."
- "You can also just add..."
- "A shorter approach would be..."
- Omitting the cleanup function in React
- Skipping TypeScript type declarations
- Removing the polling logic (`setTimeout(init, 50)`)

### ✅ DO THIS:
- Copy the complete code block for the detected project type
- Replace ONLY `YOUR_SITE_KEY` with the actual key
- Keep all comments and structure intact

## Project Detection

Detect the project type by checking for these files:

| Project Type | Detection Method |
|--------------|------------------|
| **Next.js** | `next.config.js`, `next.config.ts`, or `next.config.mjs` exists |
| **React** | `package.json` contains `react` dependency (but no Next.js) |
| **WordPress** | `functions.php` exists or `wp-content` directory present |
| **Shopify** | `theme.liquid` exists or `.shopify` directory present |
| **HTML** | `.html` files present without framework indicators |

## Integration Instructions

### HTML Projects

Add this code just before the closing `</body>` tag:

```html
<script src="https://widget-studio.weez.boo/sdk/index.global.js"></script>
<script>
  WidgetX.init({
    siteKey: ''YOUR_SITE_KEY''
  })
</script>
```

### React Projects

Add this to your main `App.tsx` or `App.jsx`:

```tsx
import { useEffect } from ''react''

function App() {
  useEffect(() => {
    const script = document.createElement(''script'')
    script.src = ''https://widget-studio.weez.boo/sdk/index.global.js''
    script.async = true
    script.onload = () => {
      window.WidgetX?.init({
        siteKey: ''YOUR_SITE_KEY'',
      })
    }
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  return <>{/* Your app content */}</>
}

export default App
```

If the project uses TypeScript, also add this type declaration to a `.d.ts` file or at the top of the component:

```typescript
declare global {
  interface Window {
    WidgetX?: {
      init: (config: { siteKey: string }) => void
    }
  }
}
```

### Next.js Projects (App Router)

Add this code to app/layout.tsx. If that file is not a client-side component (doesn''t have ''use client'' directive), find the first global layout file in your app that is client-side and add the code there instead.

```tsx
''use client''
import Script from ''next/script''

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="https://widget-studio.weez.boo/sdk/index.global.js"
          strategy="afterInteractive"
          onLoad={() => {
            window.WidgetX?.init({
              siteKey: ''YOUR_SITE_KEY'',
            })
          }}
        />
      </body>
    </html>
  )
}
```

### Next.js Projects (Pages Router)

Add this to `pages/_app.tsx`:

```tsx
import Script from ''next/script''
import type { AppProps } from ''next/app''

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Script
        src="https://widget-studio.weez.boo/sdk/index.global.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.WidgetX?.init({
            siteKey: ''YOUR_SITE_KEY'',
          })
        }}
      />
    </>
  )
}
```

### Shopify Projects

Add this code to `theme.liquid`, just before `</body>`:

Location: **Online Store > Themes > Edit code > Layout > theme.liquid**

```html
<script async src="https://widget-studio.weez.boo/sdk/index.global.js"></script>
<script>
  (function () {
    if (window.__widgetx_inited) return;
    window.__widgetx_inited = true;

    function init() {
      if (!window.WidgetX) return setTimeout(init, 50);

      window.WidgetX.init({
        siteKey: ''YOUR_SITE_KEY'',
      });
    }

    init();
  })();
</script>
```

### WordPress Projects

Add this code to `functions.php`:

```php
<?php
add_action(''wp_enqueue_scripts'', function () {
  wp_enqueue_script(
    ''widgetx-sdk'',
    ''https://widget-studio.weez.boo/sdk/index.global.js'',
    array(),
    null,
    true
  );

  $inline = <<<JS
(function () {
  if (window.__widgetx_inited) return;
  window.__widgetx_inited = true;

  function init() {
    if (!window.WidgetX) return setTimeout(init, 50);

    window.WidgetX.init({
      siteKey: "YOUR_SITE_KEY",
    });
  }

  init();
})();
JS;

  wp_add_inline_script(''widgetx-sdk'', $inline, ''after'');
});
```

## Important Notes

1. **Replace `YOUR_SITE_KEY`** with the user''s actual site key in all code snippets
2. The SDK URL is always: `https://widget-studio.weez.boo/sdk/index.global.js`
3. For Shopify and WordPress, the double-init prevention (`__widgetx_inited`) is important to avoid issues with theme reloads
4. Always load the script with `async` attribute when possible for better performance
' WHERE slug = 'neversight-widget-studio';
UPDATE skills SET content = '---
name: react-19
description: >
  React 19 patterns and breaking changes vs React 18.
  Trigger: When writing React 19 components/hooks in .tsx (ref as prop, new hooks, Actions, deprecations).
  If using Next.js App Router/Server Actions, also use nextjs-15.
license: MIT
metadata:
  author: noklip-io
  version: "1.0"
  scope: [root, ui]
  auto_invoke: "Writing React 19 components"
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, WebFetch, WebSearch, Task
---

# React 19 - Key Changes

This skill focuses on **what changed** in React 19. Not a complete React reference.

## Coming from React 16/17?

If upgrading from pre-18 versions, these changes accumulated and are **now mandatory**:

| Change | Introduced | React 19 Status |
|--------|------------|-----------------|
| `createRoot` / `hydrateRoot` | React 18 | **Required** (`ReactDOM.render` removed) |
| Concurrent rendering | React 18 | Foundation for all R19 features |
| Automatic batching | React 18 | Default behavior |
| `useId`, `useSyncExternalStore` | React 18 | Stable, commonly used |
| Hooks (no classes for new code) | React 16.8 | Only path for new features |
| `createContext` (not legacy) | React 16.3 | **Required** (legacy Context removed) |
| Error Boundaries | React 16 | Now with better error callbacks |

**Migration path:** Upgrade to React 18.3 first (shows deprecation warnings), then to 19.

## The React 19 Mindset

React 19 represents fundamental shifts in how to think about React:

| Old Thinking | New Thinking |
|--------------|--------------|
| Client-side by default | **Server-first** (RSC default) |
| Manual memoization | **Compiler handles it** |
| `useEffect` for data | **async Server Components** |
| `useState` for forms | **Form Actions** |
| Loading state booleans | **Suspense boundaries** |
| Optimize everything | **Write correct code, compiler optimizes** |

See [references/paradigm-shifts.md](./references/paradigm-shifts.md) for the mental model changes.

See [references/anti-patterns.md](./references/anti-patterns.md) for what to stop doing.

## Quick Reference: What''s New

| Feature | React 18 | React 19+ |
|---------|----------|-----------|
| Memoization | Manual (`useMemo`, `useCallback`, `memo`) | React Compiler (automatic) or manual |
| Forward refs | `forwardRef()` wrapper | `ref` as regular prop |
| Context provider | `<Context.Provider value={}>` | `<Context value={}>` |
| Form state | Custom with `useState` | `useActionState` hook |
| Optimistic updates | Manual state management | `useOptimistic` hook |
| Read promises | Not possible in render | `use()` hook |
| Conditional context | Not possible | `use(Context)` after conditionals |
| Form pending state | Manual tracking | `useFormStatus` hook |
| Ref cleanup | Pass `null` on unmount | Return cleanup function |
| Document metadata | `react-helmet` or manual | Native `<title>`, `<meta>`, `<link>` |
| Hide/show UI with state | Unmount/remount (state lost) | `<Activity>` component (19.2+) |
| Non-reactive Effect logic | Add to deps or suppress lint | `useEffectEvent` hook (19.2+) |
| Custom Elements | Partial support | Full support (props as properties) |
| Hydration errors | Multiple vague errors | Single error with diff |

## React Compiler & Memoization

With React Compiler enabled, manual memoization is **optional, not forbidden**:

```tsx
// React Compiler handles this automatically
function Component({ items }) {
  const filtered = items.filter(x => x.active);
  const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name));
  const handleClick = (id) => console.log(id);
  return <List items={sorted} onClick={handleClick} />;
}

// Manual memoization still works as escape hatch for fine-grained control
const filtered = useMemo(() => expensiveOperation(items), [items]);
const handleClick = useCallback((id) => onClick(id), [onClick]);
```

**When to use manual memoization with React Compiler:**
- Effect dependencies that need stable references
- Sharing expensive calculations across components (compiler doesn''t share)
- Explicit control over when re-computation happens

See [references/react-compiler.md](./references/react-compiler.md) for details.

## ref as Prop (forwardRef Deprecated)

```tsx
// React 19: ref is just a prop
function Input({ placeholder, ref }) {
  return <input placeholder={placeholder} ref={ref} />;
}

// Usage - no change
const inputRef = useRef(null);
<Input ref={inputRef} placeholder="Enter text" />

// forwardRef still works but will be deprecated
// Codemod: npx codemod@latest react/19/replace-forward-ref
```

## Ref Cleanup Functions

```tsx
// React 19: Return cleanup function from ref callback
<input
  ref={(node) => {
    // Setup
    node?.focus();
    // Return cleanup (called on unmount or ref change)
    return () => {
      console.log(''Cleanup'');
    };
  }}
/>

// React 18: Received null on unmount (still works, but cleanup preferred)
<input ref={(node) => {
  if (node) { /* setup */ }
  else { /* cleanup */ }
}} />
```

## Context as Provider

```tsx
const ThemeContext = createContext(''light'');

// React 19: Use Context directly
function App({ children }) {
  return (
    <ThemeContext value="dark">
      {children}
    </ThemeContext>
  );
}

// React 18: Required .Provider (still works, will be deprecated)
<ThemeContext.Provider value="dark">
  {children}
</ThemeContext.Provider>
```

## New Hooks

### useActionState

```tsx
import { useActionState } from ''react'';

function Form() {
  const [error, submitAction, isPending] = useActionState(
    async (prevState, formData) => {
      const result = await saveData(formData.get(''name''));
      if (result.error) return result.error;
      redirect(''/success'');
      return null;
    },
    null // initial state
  );

  return (
    <form action={submitAction}>
      <input name="name" disabled={isPending} />
      <button disabled={isPending}>
        {isPending ? ''Saving...'' : ''Save''}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
```

### useOptimistic

```tsx
import { useOptimistic } from ''react'';

function Messages({ messages, sendMessage }) {
  const [optimisticMessages, addOptimistic] = useOptimistic(
    messages,
    (state, newMessage) => [...state, { ...newMessage, sending: true }]
  );

  async function handleSubmit(formData) {
    const message = { text: formData.get(''text''), id: Date.now() };
    addOptimistic(message); // Show immediately
    await sendMessage(message); // Reverts on error
  }

  return (
    <form action={handleSubmit}>
      {optimisticMessages.map(m => (
        <div key={m.id} style={{ opacity: m.sending ? 0.5 : 1 }}>
          {m.text}
        </div>
      ))}
      <input name="text" />
    </form>
  );
}
```

### use() Hook

```tsx
import { use, Suspense } from ''react'';

// Read promises (suspends until resolved)
function Comments({ commentsPromise }) {
  const comments = use(commentsPromise);
  return comments.map(c => <p key={c.id}>{c.text}</p>);
}

// Usage with Suspense
<Suspense fallback={<Spinner />}>
  <Comments commentsPromise={fetchComments()} />
</Suspense>

// Conditional context reading (not possible with useContext!)
function Theme({ showTheme }) {
  if (!showTheme) return <div>Plain</div>;

  const theme = use(ThemeContext); // Can be called conditionally!
  return <div style={{ color: theme.primary }}>Themed</div>;
}
```

### useFormStatus (react-dom)

```tsx
import { useFormStatus } from ''react-dom'';

// Must be used inside a <form> - reads parent form status
function SubmitButton() {
  const { pending, data, method, action } = useFormStatus();
  return (
    <button disabled={pending}>
      {pending ? ''Submitting...'' : ''Submit''}
    </button>
  );
}

function Form() {
  return (
    <form action={serverAction}>
      <input name="email" />
      <SubmitButton /> {/* Reads form status via context */}
    </form>
  );
}
```

See [references/new-hooks.md](./references/new-hooks.md) for complete API details.

## Form Actions

```tsx
// Pass function directly to form action
<form action={async (formData) => {
  ''use server'';
  await saveToDatabase(formData);
}}>
  <input name="email" type="email" />
  <button type="submit">Subscribe</button>
</form>

// Button-level actions
<form>
  <button formAction={saveAction}>Save</button>
  <button formAction={deleteAction}>Delete</button>
</form>

// Manual form reset
import { requestFormReset } from ''react-dom'';
requestFormReset(formElement);
```

## Document Metadata

```tsx
// Automatically hoisted to <head> - works in any component
function BlogPost({ post }) {
  return (
    <article>
      <title>{post.title}</title>
      <meta name="description" content={post.excerpt} />
      <meta name="author" content={post.author} />
      <link rel="canonical" href={post.url} />
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  );
}
```

## Resource Preloading

```tsx
import { prefetchDNS, preconnect, preload, preinit } from ''react-dom'';

function App() {
  // DNS prefetch
  prefetchDNS(''https://api.example.com'');

  // Establish connection early
  preconnect(''https://fonts.googleapis.com'');

  // Preload resources
  preload(''https://example.com/font.woff2'', { as: ''font'' });
  preload(''/hero.jpg'', { as: ''image'' });

  // Load and execute script eagerly
  preinit(''https://example.com/analytics.js'', { as: ''script'' });

  return <main>...</main>;
}
```

## Stylesheet Support

```tsx
// precedence controls insertion order and deduplication
function Component() {
  return (
    <>
      <link rel="stylesheet" href="/base.css" precedence="default" />
      <link rel="stylesheet" href="/theme.css" precedence="high" />
      <div className="styled">Content</div>
    </>
  );
}

// React ensures stylesheets load before Suspense boundary reveals
<Suspense fallback={<Skeleton />}>
  <link rel="stylesheet" href="/feature.css" precedence="default" />
  <FeatureComponent />
</Suspense>
```

## Custom Elements Support

React 19 adds full support for Custom Elements (Web Components).

```tsx
// Props matching element properties are assigned as properties
// Others are assigned as attributes
<my-element
  stringAttr="hello"           // Attribute (string)
  complexProp={{ foo: ''bar'' }} // Property (object)
  onCustomEvent={handleEvent}  // Property (function)
/>
```

**Client-side:** React checks if a property exists on the element instance. If yes, assigns as property; otherwise, as attribute.

**Server-side (SSR):** Primitive types (string, number) render as attributes. Objects, functions, symbols are omitted from HTML.

```tsx
// Define custom element
class MyElement extends HTMLElement {
  constructor() {
    super();
    this.data = undefined; // React will assign to this property
  }

  connectedCallback() {
    this.textContent = JSON.stringify(this.data);
  }
}
customElements.define(''my-element'', MyElement);

// Use in React
<my-element data={{ items: [1, 2, 3] }} />
```

## Hydration Improvements

### Better Error Messages

React 19 shows a single error with a diff instead of multiple vague errors:

```
Uncaught Error: Hydration failed because the server rendered HTML
didn''t match the client.

<App>
  <span>
+   Client
-   Server
```

### Third-Party Script Compatibility

React 19 gracefully handles elements inserted by browser extensions or third-party scripts:

- Unexpected tags in `<head>` and `<body>` are skipped (no mismatch errors)
- Stylesheets from extensions are preserved during re-renders
- No need to add `suppressHydrationWarning` for extension-injected content

## Removed APIs (Breaking)

| Removed | Migration |
|---------|-----------|
| `ReactDOM.render()` | `createRoot().render()` |
| `ReactDOM.hydrate()` | `hydrateRoot()` |
| `unmountComponentAtNode()` | `root.unmount()` |
| `ReactDOM.findDOMNode()` | Use refs |
| `propTypes` | TypeScript or remove |
| `defaultProps` (functions) | ES6 default parameters |
| String refs | Callback refs or `useRef` |
| Legacy Context | `createContext` |
| `React.createFactory` | JSX |
| `react-dom/test-utils` | `act` from `''react''` |

See [references/deprecations.md](./references/deprecations.md) for migration guides.

## TypeScript Changes

```tsx
// useRef requires argument
const ref = useRef<HTMLDivElement>(null); // Required
const ref = useRef(); // Error in React 19

// Ref callbacks must not return values (except cleanup)
<div ref={(node) => { instance = node; }} /> // Correct
<div ref={(node) => (instance = node)} />    // Error - implicit return

// ReactElement props are now unknown (not any)
type Props = ReactElement[''props'']; // unknown in R19, any in R18

// JSX namespace - import explicitly
import type { JSX } from ''react'';
```

See [references/typescript-changes.md](./references/typescript-changes.md) for codemods.

## Migration Codemods

```bash
# Run all React 19 codemods
npx codemod@latest react/19/migration-recipe

# Individual codemods
npx codemod@latest react/19/replace-reactdom-render
npx codemod@latest react/19/replace-string-ref
npx codemod@latest react/19/replace-act-import
npx codemod@latest react/19/replace-use-form-state
npx codemod@latest react/prop-types-typescript

# TypeScript types
npx types-react-codemod@latest preset-19 ./src
```

## Imports (Best Practice)

```tsx
// Named imports (recommended)
import { useState, useEffect, useRef, use } from ''react'';
import { createRoot } from ''react-dom/client'';
import { useFormStatus } from ''react-dom'';

// Default import still works but named preferred
import React from ''react''; // Works but not recommended
```

## Error Handling Changes

```tsx
// React 19 error handling options
const root = createRoot(container, {
  onUncaughtError: (error, errorInfo) => {
    // Errors not caught by Error Boundary
    console.error(''Uncaught:'', error, errorInfo.componentStack);
  },
  onCaughtError: (error, errorInfo) => {
    // Errors caught by Error Boundary
    reportToAnalytics(error);
  },
  onRecoverableError: (error, errorInfo) => {
    // Errors React recovered from automatically
    console.warn(''Recovered:'', error);
  }
});
```

See [references/suspense-streaming.md](./references/suspense-streaming.md) for Suspense patterns and error boundaries.

## React 19.2+ Features

### Activity Component (19.2)

Hide/show UI while preserving state (like background tabs):

```tsx
import { Activity } from ''react'';

// State preserved when hidden, Effects cleaned up
<Activity mode={isVisible ? ''visible'' : ''hidden''}>
  <ExpensiveComponent />
</Activity>
```

### useEffectEvent Hook (19.2)

Extract non-reactive logic from Effects without adding dependencies:

```tsx
import { useEffect, useEffectEvent } from ''react'';

function Chat({ roomId, theme }) {
  // Reads theme without making it a dependency
  const onConnected = useEffectEvent(() => {
    showNotification(`Connected!`, theme);
  });

  useEffect(() => {
    const conn = connect(roomId);
    conn.on(''connected'', onConnected);
    return () => conn.disconnect();
  }, [roomId]); //

<!-- truncated -->' WHERE slug = 'neversight-react-19';
UPDATE skills SET content = '---
name: review-vue
description: Review Vue 3 code for Composition API, reactivity, components, state (Pinia), routing, and performance. Framework-only atomic skill; output is a findings list.
tags: [eng-standards]
related_skills: [review-diff, review-codebase, review-code]
version: 1.0.0
license: MIT
recommended_scope: project
metadata:
  author: ai-cortex
---

# Skill: Review Vue

## Purpose

Review **Vue 3** code for **framework conventions** only. Do not define scope (diff vs codebase) or perform security/architecture analysis; those are handled by scope and cognitive skills. Emit a **findings list** in the standard format for aggregation. Focus on Composition API and `<script setup>`, reactivity (ref/reactive, computed/watch), component boundaries and props/emits, state (Pinia/store), routing and guards, performance (e.g. v-memo), and accessibility where relevant.

---

## Use Cases

- **Orchestrated review**: Used as the framework step when [review-code](../review-code/SKILL.md) runs scope → language → framework → library → cognitive for Vue projects.
- **Vue-only review**: When the user wants only Vue/frontend framework conventions checked.
- **Pre-PR Vue checklist**: Ensure Composition API usage, reactivity, and component contracts are correct.

**When to use**: When the code under review is Vue 3 and the task includes framework quality. Scope is determined by the caller or user.

---

## Behavior

### Scope of this skill

- **Analyze**: Vue 3 framework conventions in the **given code scope** (files or diff provided by the caller). Do not decide scope; accept the code range as input.
- **Do not**: Perform scope selection, security review, or architecture review; do not review non-Vue files for Vue rules unless in scope (e.g. mixed repo).

### Review checklist (Vue framework only)

1. **Composition API and script setup**: Prefer `<script setup>` and Composition API; correct use of defineProps, defineEmits, defineExpose; lifecycle hooks (onMounted, onUnmounted, etc.).
2. **Reactivity**: Correct use of ref vs reactive; computed vs watch; avoid mutating props; deep reactivity and unwrapping in templates.
3. **Component boundaries**: Clear props/emits contracts; avoid prop drilling where a store or provide/inject is appropriate; single responsibility per component.
4. **State (Pinia/store)**: Appropriate use of Pinia (or Vuex) stores; avoid duplicating server state in multiple places; actions vs direct mutation.
5. **Routing and guards**: Vue Router usage; navigation guards and lazy loading; route params and query handling.
6. **Performance**: v-memo where list rendering is expensive; avoid unnecessary re-renders; key usage in lists.
7. **Accessibility**: Semantic HTML and ARIA where relevant; form labels and focus management.

### Tone and references

- **Professional and technical**: Reference specific locations (file:line or component name). Emit findings with Location, Category, Severity, Title, Description, Suggestion.

---

## Input & Output

### Input

- **Code scope**: Files or directories (or diff) containing Vue 3 code (.vue, .ts with Vue APIs). Provided by the user or scope skill.

### Output

- Emit zero or more **findings** in the format defined in **Appendix: Output contract**.
- Category for this skill is **framework-vue**.

---

## Restrictions

- **Do not** perform scope selection, security, or architecture review. Stay within Vue 3 framework conventions.
- **Do not** give conclusions without specific locations or actionable suggestions.
- **Do not** review non-Vue code for Vue-specific rules unless explicitly in scope.

---

## Self-Check

- [ ] Was only the Vue framework dimension reviewed (no scope/security/architecture)?
- [ ] Are Composition API, reactivity, components, state, routing, and performance covered where relevant?
- [ ] Is each finding emitted with Location, Category=framework-vue, Severity, Title, Description, and optional Suggestion?
- [ ] Are issues referenced with file:line or component?

---

## Examples

### Example 1: Mutating props

- **Input**: Component that assigns to a prop in script or template.
- **Expected**: Emit a finding (major/minor) for prop mutation; suggest local state or emit to parent. Category = framework-vue.

### Example 2: Missing key in v-for

- **Input**: v-for without :key or with non-stable key (e.g. index).
- **Expected**: Emit finding for list identity and performance; suggest stable unique key. Category = framework-vue.

### Edge case: Vue 2 Options API

- **Input**: Legacy Vue 2 Options API in a mixed codebase.
- **Expected**: Review for Vue 2 patterns (data, methods, lifecycle) if the skill is extended to Vue 2; otherwise note "Vue 3 Composition API preferred" where migration is feasible. For this skill, focus on Vue 3; note Vue 2 only if explicitly in scope.

---

## Appendix: Output contract

Each finding MUST follow the standard findings format:

| Element | Requirement |
| :--- | :--- |
| **Location** | `path/to/file.vue` or `.ts` (optional line or range). |
| **Category** | `framework-vue`. |
| **Severity** | `critical` \| `major` \| `minor` \| `suggestion`. |
| **Title** | Short one-line summary. |
| **Description** | 1–3 sentences. |
| **Suggestion** | Concrete fix or improvement (optional). |

Example:

```markdown
- **Location**: `src/components/UserList.vue:18`
- **Category**: framework-vue
- **Severity**: major
- **Title**: v-for missing stable key
- **Description**: Using index as key can cause incorrect reuse and state bugs when list order changes.
- **Suggestion**: Use a unique stable id (e.g. user.id) as :key.
```
' WHERE slug = 'neversight-review-vue';
UPDATE skills SET content = '---
name: fetch-library-docs
description: Fetches official documentation for external libraries and frameworks (React, Next.js, Prisma, FastAPI, Express, Tailwind, MongoDB, etc.) with 60-90% token savings via content-type filtering. Use this skill when implementing features using library APIs, debugging library-specific errors, troubleshooting configuration issues, installing or setting up frameworks, integrating third-party packages, upgrading between library versions, or looking up correct API patterns and best practices. Triggers automatically during coding work - fetch docs before writing library code to get correct patterns, not after guessing wrong.
---

# Library Documentation Skill

Fetches official library documentation with 60-90% token savings.

---

## WHEN TO INVOKE (Auto-Detection)

**INVOKE AUTOMATICALLY when:**

| Context | Detection Signal | Content Type |
|---------|------------------|--------------|
| **Implementing** | About to write code using library API | `examples,api-ref` |
| **Debugging** | Error contains library name (e.g., `PrismaClientError`) | `troubleshooting` |
| **Installing** | Adding new package, `npm install`, setup task | `setup` |
| **Integrating** | Connecting libraries ("use X with Y") | `examples,setup` |
| **Upgrading** | Version migration, breaking changes | `migration` |
| **Uncertain** | First use of library feature, unsure of pattern | `examples` |

**DO NOT INVOKE when:**
- Already have sufficient knowledge from training
- User pasted docs or has them open
- Task is about local/private code (use codebase search)
- Comparing libraries (use web search)

---

## DECISION LOGIC

### 1. Identify Library

```
Priority: User mention → Error message → File imports → package.json → Ask user
```

Examples:
- `PrismaClientKnownRequestError` → library = "prisma"
- `import { useState } from ''react''` → library = "react"
- `from fastapi import FastAPI` → library = "fastapi"

### 2. Identify Topic

```
Priority: User specifies → Error message → Feature being implemented → "getting started"
```

### 3. Select Content Type

| Task | Content Type |
|------|--------------|
| Implementing code | `examples,api-ref` |
| Debugging error | `troubleshooting,examples` |
| Installing/setup | `setup` |
| Integrating libs | `examples,setup` |
| Upgrading version | `migration` |
| Understanding why | `concepts` |
| Best practices | `patterns` |

---

## EXECUTION

```bash
# With known library ID (faster - saves 1 API call)
bash scripts/fetch-docs.sh --library-id <id> --topic "<topic>" --content-type <types>

# With library name (auto-resolves)
bash scripts/fetch-docs.sh --library <name> --topic "<topic>" --content-type <types>
```

### Quick Library IDs

| Library | ID |
|---------|----|
| React | `/reactjs/react.dev` |
| Next.js | `/vercel/next.js` |
| Prisma | `/prisma/docs` |
| Tailwind | `/tailwindlabs/tailwindcss.com` |
| FastAPI | `/tiangolo/fastapi` |

See [references/library-ids.md](references/library-ids.md) for complete list.

---

## ERROR HANDLING (Quick Reference)

| Error | Action |
|-------|--------|
| `[LIBRARY_NOT_FOUND]` | Try spelling variations |
| `[LIBRARY_MISMATCH]` | Use --library-id directly |
| `[EMPTY_RESULTS]` | Broaden topic or use `--content-type all` |
| `[RATE_LIMIT_ERROR]` | Check API key setup |

**Call Budget**: Context7 allows 3 calls/question. Use `--library-id` to save 1 call.

See [references/context7-tools.md](references/context7-tools.md) for full error handling.

---

## REFERENCES

- [Library IDs](references/library-ids.md) - Complete library ID list
- [Usage Patterns](references/patterns.md) - Real-world examples
- [Context7 Tools](references/context7-tools.md) - API details, error codes, setup
' WHERE slug = 'neversight-fetch-library-docs';
UPDATE skills SET content = '---
name: react-expert
id: react-expert
version: 1.2.0
description: "Senior specialist in React 19.2+ performance, React Compiler (Forget), and advanced architectural patterns. Use when optimizing re-renders, bundle size, data fetching waterfalls (cacheSignal), or server-side efficiency (PPR)."
---

# ⚡ Skill: react-expert

## Description
This skill provides comprehensive performance optimization guidance for React applications, optimized for AI-assisted workflows in 2026. It focuses on eliminating waterfalls, leveraging the React Compiler, and maximizing both server and client-side efficiency through modern APIs (`use`, `useActionState`, `<Activity>`).

## Core Priorities
1. **Eliminating Waterfalls**: The #1 priority. Move fetches as high as possible, parallelize operations, and use `cacheSignal` to prevent wasted work.
2. **React Compiler Optimization**: Structuring code to be "Forget-friendly" (automatic memoization) while knowing when manual intervention is still needed.
3. **Partial Pre-rendering (PPR)**: Combining the best of static and dynamic rendering for sub-100ms LCP.
4. **Hydration Strategy**: Avoiding "hydration mismatch" and using `<Activity>` for state preservation.

## 🏆 Top 5 Performance Gains in 2026

1.  **React Compiler (Automatic Memoization)**: Removes the "useMemo tax". Code that adheres to "Rules of React" is automatically optimized.
2.  **Partial Pre-rendering (PPR)**: Serves static shells instantly while streaming dynamic content in the same request.
3.  **The `use()` API**: Eliminates the `useEffect` + `useState` boilerplate for data fetching, reducing client-side code by up to 30%.
4.  **`cacheSignal`**: Allows the server to abort expensive async work if the client disconnects or navigates away.
5.  **Server Actions + `useActionState`**: Native handling of pending states and optimistic updates, reducing reliance on third-party form/state libraries.

## Table of Contents & Detailed Guides

### 1. [Eliminating Waterfalls](./references/1-waterfalls.md) — **CRITICAL**
- Defer Await Until Needed
- `cacheSignal` for Lifecycle Management
- Dependency-Based Parallelization (`better-all`)
- `Promise.all()` for Independent Operations
- Strategic Suspense Boundaries

### 2. [Bundle Size Optimization](./references/2-bundle-optimization.md) — **CRITICAL**
- Avoiding Barrel File Imports (Lucide, MUI, etc.)
- Conditional Module Loading (Dynamic `import()`)
- Deferring Non-Critical Libraries (Analytics)
- Preloading based on User Intent

### 3. [Server-Side Performance](./references/3-server-side.md) — **HIGH**
- **Partial Pre-rendering (PPR)** Deep Dive
- Cross-Request LRU Caching
- Minimizing Serialization at RSC Boundaries
- Parallel Data Fetching with Component Composition

### 4. [Client-Side & Data Fetching](./references/4-hooks-and-actions.md) — **MEDIUM-HIGH**
- **`use()` API** for Promises and Context
- **`useActionState`** for Form Management
- **`useOptimistic`** for Instant UI Feedback
- Deduplicating Global Event Listeners

### 5. [React Compiler & Re-renders](./references/5-compiler-and-rerender.md) — **MEDIUM**
- **Compiler Rules**: Side-effect-free rendering
- Deferring State Reads
- Narrowing Effect Dependencies
- Transitions for Non-Urgent Updates (`startTransition`)

### 6. [Rendering Performance](./references/6-7-8-rendering-and-js.md) — **MEDIUM**
- **`<Activity>` Component** (Show/Hide with State preservation)
- CSS `content-visibility`
- Hydration Mismatch Prevention (No-Flicker)
- Hoisting Static JSX

### 7. [JavaScript Micro-Optimizations](./references/6-7-8-rendering-and-js.md) — **LOW-MEDIUM**
- Batching DOM Changes
- Index Maps vs `.find()`
- `toSorted()` vs `sort()`

### 8. [Advanced Patterns](./references/6-7-8-rendering-and-js.md) — **LOW**
- Event Handlers in Refs / `useEffectEvent`
- `useLatest` for Stable Callback Refs

## Quick Reference: The "Do''s" and "Don''ts"

| **Don''t** | **Do** |
| :--- | :--- |
| `import { Icon } from ''large-lib''` | `import Icon from ''large-lib/Icon''` |
| `await a(); await b();` | `Promise.all([a(), b()])` |
| `useEffect(() => { fetch(...) }, [])` | `const data = use(dataPromise)` |
| `const [state, set] = useState(init())` | `useState(() => init())` |
| `array.sort()` | `array.toSorted()` |
| `searchParams` in component body | `searchParams` only in callbacks |
| Manual `useMemo`/`useCallback` (mostly) | Trust React Compiler (but check Rules of React) |

---
*Optimized for React 19.2+ and Next.js 16.1+.*
*Updated: January 22, 2026 - 14:59*
' WHERE slug = 'neversight-react-expert-ill-md';
UPDATE skills SET content = '---
name: mobile
description: Use this skill when building mobile applications, React Native apps, Expo projects, iOS/Android development, or cross-platform mobile features. Activates on mentions of React Native, Expo, mobile app, iOS, Android, Swift, Kotlin, Flutter, app store, push notifications, deep linking, mobile navigation, or native modules.
---

# Mobile Development

Build native-quality mobile apps with React Native and Expo.

## Quick Reference

### Expo SDK 53+ (2026 Standard)

**New Architecture is DEFAULT** - No opt-in required.

```bash
# Create new project
npx create-expo-app@latest my-app
cd my-app
npx expo start
```

**Key Changes:**

- Hermes engine default (JSC deprecated)
- Fabric renderer + Bridgeless mode
- All `expo-*` packages support New Architecture
- `expo-video` replaces `expo-av` for video
- `expo-audio` replaces `expo-av` for audio

### Project Structure

```
app/
├── (tabs)/           # Tab navigation group
│   ├── index.tsx     # Home tab
│   ├── profile.tsx   # Profile tab
│   └── _layout.tsx   # Tab layout
├── [id].tsx          # Dynamic route
├── _layout.tsx       # Root layout
└── +not-found.tsx    # 404 page
```

### Navigation (Expo Router)

```tsx
// app/_layout.tsx
import { Stack } from "expo-router";

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}
```

**Deep Linking**

```tsx
// Navigate programmatically
import { router } from "expo-router";
router.push("/profile/123");
router.replace("/home");
router.back();
```

### Native Modules (New Architecture)

**Turbo Modules** - Synchronous, type-safe native access:

```tsx
// specs/NativeCalculator.ts
import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;
}

export default TurboModuleRegistry.getEnforcing<Spec>("Calculator");
```

### Styling

**NativeWind (Tailwind for RN)**

```tsx
import { View, Text } from "react-native";

export function Card() {
  return (
    <View className="bg-white rounded-xl p-4 shadow-lg">
      <Text className="text-lg font-bold text-gray-900">Title</Text>
    </View>
  );
}
```

### State Management

Same as web - TanStack Query for server state, Zustand for client:

```tsx
import { useQuery } from "@tanstack/react-query";

function ProfileScreen() {
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: fetchUser,
  });
  return <UserProfile user={user} />;
}
```

### OTA Updates

```tsx
// app.config.js
export default {
  expo: {
    updates: {
      url: "https://u.expo.dev/your-project-id",
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: {
      policy: "appVersion",
    },
  },
};
```

### Push Notifications

```tsx
import * as Notifications from "expo-notifications";

// Request permissions
const { status } = await Notifications.requestPermissionsAsync();

// Get push token
const token = await Notifications.getExpoPushTokenAsync({
  projectId: "your-project-id",
});

// Schedule local notification
await Notifications.scheduleNotificationAsync({
  content: { title: "Reminder", body: "Check the app!" },
  trigger: { seconds: 60 },
});
```

### Performance Tips

1. **Use FlashList** over FlatList for long lists
2. **Avoid inline styles** - Use StyleSheet.create or NativeWind
3. **Optimize images** - Use expo-image with caching
4. **Profile with Flipper** or React DevTools

### Build & Deploy

```bash
# Development build
npx expo run:ios
npx expo run:android

# Production build (EAS)
eas build --platform all --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## Agents

- **mobile-app-builder** - Full mobile development expertise

## Deep Dives

- [references/expo-sdk-53.md](references/expo-sdk-53.md)
- [references/new-architecture.md](references/new-architecture.md)
- [references/native-modules.md](references/native-modules.md)
- [references/app-store-submission.md](references/app-store-submission.md)

## Examples

- [examples/expo-starter/](examples/expo-starter/)
- [examples/push-notifications/](examples/push-notifications/)
- [examples/native-module/](examples/native-module/)
' WHERE slug = 'neversight-mobile';
UPDATE skills SET content = '---
name: expo-react-native-typescript
description: Expert in Expo React Native TypeScript mobile development with best practices
---

# Expo React Native TypeScript

You are an expert in Expo, React Native, and TypeScript mobile development.

## Core Principles

- Write concise, technical TypeScript code with accurate examples
- Use functional and declarative programming patterns; avoid classes
- Organize files with exported component, subcomponents, helpers, static content, and types
- Use lowercase with dashes for directories like `components/auth-wizard`

## TypeScript Standards

- Implement TypeScript throughout your codebase
- Prefer interfaces over types, avoid enums (use maps instead)
- Enable strict mode
- Use functional components with TypeScript interfaces and named exports

## UI & Styling

- Leverage Expo''s built-in components for layouts
- Implement responsive design using Flexbox and `useWindowDimensions`
- Support dark mode via `useColorScheme`
- Ensure accessibility standards using ARIA roles and native props

## Safe Area Management

- Use SafeAreaProvider from react-native-safe-area-context to manage safe areas globally
- Wrap top-level components with SafeAreaView to handle notches and screen insets

## Performance Optimization

- Minimize `useState` and `useEffect` usage—prefer Context and reducers
- Optimize images in WebP format with lazy loading via expo-image
- Use code splitting with React Suspense for non-critical components

## Navigation & State

- Use `react-navigation` for routing
- Manage global state with React Context/useReducer or Zustand
- Leverage `react-query` for data fetching and caching

## Error Handling

- Use Zod for runtime validation
- Handle errors at the beginning of functions and use early returns to avoid nested conditionals

## Testing & Security

- Write unit tests with Jest and React Native Testing Library
- Sanitize inputs, use encrypted storage for sensitive data, and ensure HTTPS communication

## Key Conventions

- Rely on Expo''s managed workflow
- Prioritize Mobile Web Vitals
- Use `expo-constants` for environment variables
- Test extensively on both iOS and Android platforms
' WHERE slug = 'neversight-expo-react-native-typescript';
UPDATE skills SET content = '---
name: base-ui-docs
description: Base UI (@base-ui/react) の公式ドキュメント参照とAPI確認を行うためのスキル。Base UIのコンポーネント/ハンドブック/概要に関する質問が来たら使う。
metadata:
  short-description: Base UI docs reference
---

# Base UI Docs

## 使いどころ
- Base UI の使い方、API、スタイリング指針を確認したいとき

## 進め方
- まず `references/llms.txt` から該当ページを探す
- 詳細が必要なら、該当ページの「View as Markdown」を取得して読む
- ネットワーク制限がある場合はユーザーに許可を依頼する
' WHERE slug = 'neversight-base-ui-docs';
UPDATE skills SET content = '---
name: chatgpt-app-builder
description: Build ChatGPT apps with interactive widgets using mcp-use and OpenAI Apps SDK. Use when creating ChatGPT apps, building MCP servers with widgets, defining React widgets, working with Apps SDK, or when user mentions ChatGPT widgets, mcp-use widgets, or Apps SDK development.
---

# ChatGPT App Builder

Build production-ready ChatGPT apps with interactive widgets using the mcp-use framework and OpenAI Apps SDK. This skill provides zero-config widget development with automatic registration and built-in React hooks.

## Quick Start

**Always bootstrap with the Apps SDK template:**

```bash
npx create-mcp-use-app my-chatgpt-app --template apps-sdk
cd my-chatgpt-app
yarn install
yarn dev
```

This creates a project structure:

```
my-chatgpt-app/
├── resources/              # React widgets (auto-registered!)
│   ├── display-weather.tsx # Example widget
│   └── product-card.tsx    # Another widget
├── public/                 # Static assets
│   └── images/
├── index.ts               # MCP server entry
├── package.json
├── tsconfig.json
└── README.md
```

## Why mcp-use for ChatGPT Apps?

Traditional OpenAI Apps SDK requires significant manual setup:
- Separate project structure (server/ and web/ folders)
- Manual esbuild/webpack configuration
- Custom useWidgetState hook implementation
- Manual React mounting code
- Manual CSP configuration
- Manual widget registration

**mcp-use simplifies everything:**
- ✅ Single command setup
- ✅ Drop widgets in `resources/` folder - auto-registered
- ✅ Built-in `useWidget()` hook with state, props, tool calls
- ✅ Automatic bundling with hot reload
- ✅ Automatic CSP configuration
- ✅ Built-in Inspector for testing

## Creating Widgets

### Simple Widget (Single File)

Create `resources/weather-display.tsx`:

```tsx
import { McpUseProvider, useWidget, type WidgetMetadata } from ''mcp-use/react'';
import { z } from ''zod'';

// Define widget metadata
export const widgetMetadata: WidgetMetadata = {
  description: ''Display current weather for a city'',
  props: z.object({
    city: z.string().describe(''City name''),
    temperature: z.number().describe(''Temperature in Celsius''),
    conditions: z.string().describe(''Weather conditions''),
    humidity: z.number().describe(''Humidity percentage''),
  }),
};

const WeatherDisplay: React.FC = () => {
  const { props, isPending } = useWidget();
  
  // Always handle loading state first
  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div className="animate-pulse p-4">Loading weather...</div>
      </McpUseProvider>
    );
  }
  
  return (
    <McpUseProvider autoSize>
      <div className="weather-card p-4 rounded-lg shadow">
        <h2 className="text-2xl font-bold">{props.city}</h2>
        <div className="temp text-4xl">{props.temperature}°C</div>
        <p className="conditions">{props.conditions}</p>
        <p className="humidity">Humidity: {props.humidity}%</p>
      </div>
    </McpUseProvider>
  );
};

export default WeatherDisplay;
```

That''s it! The widget is automatically:
- Registered as MCP tool `weather-display`
- Registered as MCP resource `ui://widget/weather-display.html`
- Bundled for Apps SDK compatibility
- Ready to use in ChatGPT

### Complex Widget (Folder Structure)

For widgets with multiple components:

```
resources/
└── product-search/
    ├── widget.tsx          # Entry point (required name)
    ├── components/
    │   ├── ProductCard.tsx
    │   └── FilterBar.tsx
    ├── hooks/
    │   └── useFilter.ts
    ├── types.ts
    └── constants.ts
```

**Entry point (`widget.tsx`):**

```tsx
import { McpUseProvider, useWidget, type WidgetMetadata } from ''mcp-use/react'';
import { z } from ''zod'';
import { ProductCard } from ''./components/ProductCard'';
import { FilterBar } from ''./components/FilterBar'';

export const widgetMetadata: WidgetMetadata = {
  description: ''Display product search results with filtering'',
  props: z.object({
    products: z.array(z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
      image: z.string(),
    })),
    query: z.string(),
  }),
};

const ProductSearch: React.FC = () => {
  const { props, isPending, state, setState } = useWidget();
  
  if (isPending) {
    return <McpUseProvider autoSize><div>Loading...</div></McpUseProvider>;
  }
  
  return (
    <McpUseProvider autoSize>
      <div>
        <h1>Search: {props.query}</h1>
        <FilterBar onFilter={(filters) => setState({ filters })} />
        <div className="grid grid-cols-3 gap-4">
          {props.products.map(p => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </McpUseProvider>
  );
};

export default ProductSearch;
```

## Widget Metadata

Required metadata for automatic registration:

```typescript
export const widgetMetadata: WidgetMetadata = {
  // Required: Human-readable description
  description: ''Display weather information'',
  
  // Required: Zod schema for widget props
  props: z.object({
    city: z.string().describe(''City name''),
    temperature: z.number(),
  }),
  
  // Optional: Disable automatic tool registration
  exposeAsTool: true, // default
  
  // Optional: Apps SDK metadata
  appsSdkMetadata: {
    ''openai/widgetDescription'': ''Interactive weather display'',
    ''openai/toolInvocation/invoking'': ''Loading weather...'',
    ''openai/toolInvocation/invoked'': ''Weather loaded'',
    ''openai/widgetCSP'': {
      connect_domains: [''https://api.weather.com''],
      resource_domains: [''https://cdn.weather.com''],
    },
  },
};
```

**Important:**
- `description`: Used for tool and resource descriptions
- `props`: Zod schema defines widget input parameters
- `exposeAsTool`: Set to `false` if only using widget via custom tools
- Default Apps SDK metadata is auto-generated if not specified

## useWidget Hook

The `useWidget` hook provides everything you need:

```tsx
const {
  // Widget props from tool input
  props,
  
  // Loading state (true = tool still executing)
  isPending,
  
  // Persistent widget state
  state,
  setState,
  
  // Theme from host (light/dark)
  theme,
  
  // Call other MCP tools
  callTool,
  
  // Display mode control
  displayMode,
  requestDisplayMode,
  
  // Additional tool output
  output,
} = useWidget<MyPropsType, MyOutputType>();
```

### Props and Loading States

**Critical:** Widgets render BEFORE tool execution completes. Always handle `isPending`:

```tsx
const { props, isPending } = useWidget<WeatherProps>();

// Pattern 1: Early return
if (isPending) {
  return <div>Loading...</div>;
}
// Now props are safe to use

// Pattern 2: Conditional rendering
return (
  <div>
    {isPending ? (
      <LoadingSpinner />
    ) : (
      <div>{props.city}</div>
    )}
  </div>
);

// Pattern 3: Optional chaining (partial UI)
return (
  <div>
    <h1>{props.city ?? ''Loading...''}</h1>
  </div>
);
```

### Widget State

Persist data across widget interactions:

```tsx
const { state, setState } = useWidget();

// Save state (persists in ChatGPT localStorage)
const addFavorite = async (city: string) => {
  await setState({
    favorites: [...(state?.favorites || []), city]
  });
};

// Update with function
await setState(prev => ({
  ...prev,
  count: (prev?.count || 0) + 1
}));
```

### Calling MCP Tools

Widgets can call other tools:

```tsx
const { callTool } = useWidget();

const refreshData = async () => {
  try {
    const result = await callTool(''get-weather'', {
      city: ''Tokyo''
    });
    console.log(''Result:'', result.content);
  } catch (error) {
    console.error(''Tool call failed:'', error);
  }
};
```

### Display Mode Control

Request different display modes:

```tsx
const { displayMode, requestDisplayMode } = useWidget();

const goFullscreen = async () => {
  await requestDisplayMode(''fullscreen'');
};

// Current mode: ''inline'' | ''pip'' | ''fullscreen''
console.log(displayMode);
```

## Custom Tools with Widgets

Create tools that return widgets:

```typescript
import { MCPServer, widget, text } from ''mcp-use/server'';
import { z } from ''zod'';

const server = new MCPServer({
  name: ''weather-app'',
  version: ''1.0.0'',
});

server.tool({
  name: ''get-weather'',
  description: ''Get current weather for a city'',
  schema: z.object({
    city: z.string().describe(''City name'')
  }),
  // Widget config (registration-time metadata)
  widget: {
    name: ''weather-display'',     // Must match widget in resources/
    invoking: ''Fetching weather...'',
    invoked: ''Weather data loaded''
  }
}, async ({ city }) => {
  // Fetch data from API
  const data = await fetchWeatherAPI(city);
  
  // Return widget with runtime data
  return widget({
    props: {
      city,
      temperature: data.temp,
      conditions: data.conditions,
      humidity: data.humidity
    },
    output: text(`Weather in ${city}: ${data.temp}°C`),
    message: `Current weather for ${city}`
  });
});

server.listen();
```

**Key Points:**
- `widget: { name, invoking, invoked }` on tool definition
- `widget({ props, output })` helper returns runtime data
- `props` passed to widget, `output` shown to model
- Widget must exist in `resources/` folder

## Static Assets

Use the `public/` folder for images, fonts, etc:

```
my-app/
├── resources/
├── public/              # Static assets
│   ├── images/
│   │   ├── logo.svg
│   │   └── banner.png
│   └── fonts/
└── index.ts
```

**Using assets in widgets:**

```tsx
import { Image } from ''mcp-use/react'';

function MyWidget() {
  return (
    <div>
      {/* Paths relative to public/ folder */}
      <Image src="/images/logo.svg" alt="Logo" />
      <img src={window.__getFile?.(''images/banner.png'')} alt="Banner" />
    </div>
  );
}
```

## Components

### McpUseProvider

Unified provider combining all common setup:

```tsx
import { McpUseProvider } from ''mcp-use/react'';

function MyWidget() {
  return (
    <McpUseProvider 
      autoSize         // Auto-resize widget
      viewControls     // Add debug/fullscreen buttons
      debug            // Show debug info
    >
      <div>Widget content</div>
    </McpUseProvider>
  );
}
```

### Image Component

Handles both data URLs and public paths:

```tsx
import { Image } from ''mcp-use/react'';

function MyWidget() {
  return (
    <div>
      <Image src="/images/photo.jpg" alt="Photo" />
      <Image src="data:image/png;base64,..." alt="Data URL" />
    </div>
  );
}
```

### ErrorBoundary

Graceful error handling:

```tsx
import { ErrorBoundary } from ''mcp-use/react'';

function MyWidget() {
  return (
    <ErrorBoundary
      fallback={<div>Something went wrong</div>}
      onError={(error) => console.error(error)}
    >
      <MyComponent />
    </ErrorBoundary>
  );
}
```

## Testing

### Using the Inspector

1. **Start development server:**
   ```bash
   yarn dev
   ```

2. **Open Inspector:**
   - Navigate to `http://localhost:3000/inspector`
   
3. **Test widgets:**
   - Click Tools tab
   - Find your widget tool
   - Enter test parameters
   - Execute to see widget render

4. **Debug interactions:**
   - Use browser console
   - Check RPC logs
   - Test state persistence
   - Verify tool calls

### Testing in ChatGPT

1. **Enable Developer Mode:**
   - Settings → Connectors → Advanced → Developer mode

2. **Add your server:**
   - Go to Connectors tab
   - Add remote MCP server URL

3. **Test in conversation:**
   - Select Developer Mode from Plus menu
   - Choose your connector
   - Ask ChatGPT to use your tools

**Prompting tips:**
- Be explicit: "Use the weather-app connector''s get-weather tool..."
- Disallow alternatives: "Do not use built-in tools, only use my connector"
- Specify input: "Call get-weather with { city: ''Tokyo'' }"

## Best Practices

### Schema Design

Use descriptive schemas:

```typescript
// ✅ Good
const schema = z.object({
  city: z.string().describe(''City name (e.g., Tokyo, Paris)''),
  temperature: z.number().min(-50).max(60).describe(''Temp in Celsius''),
});

// ❌ Bad
const schema = z.object({
  city: z.string(),
  temp: z.number(),
});
```

### Theme Support

Always support both themes:

```tsx
const { theme } = useWidget();

const bgColor = theme === ''dark'' ? ''bg-gray-900'' : ''bg-white'';
const textColor = theme === ''dark'' ? ''text-white'' : ''text-gray-900'';
```

### Loading States

Always check `isPending` first:

```tsx
const { props, isPending } = useWidget<MyProps>();

if (isPending) {
  return <LoadingSpinner />;
}

// Now safe to access props.field
return <div>{props.field}</div>;
```

### Widget Focus

Keep widgets focused:

```typescript
// ✅ Good: Single purpose
export const widgetMetadata: WidgetMetadata = {
  description: ''Display weather for a city'',
  props: z.object({ city: z.string() }),
};

// ❌ Bad: Too many responsibilities
export const widgetMetadata: WidgetMetadata = {
  description: ''Weather, forecast, map, news, and more'',
  props: z.object({ /* many fields */ }),
};
```

### Error Handling

Handle errors gracefully:

```tsx
const { callTool } = useWidget();

const fetchData = async () => {
  try {
    const result = await callTool(''fetch-data'', { id: ''123'' });
    if (result.isError) {
      console.error(''Tool returned error'');
    }
  } catch (error) {
    console.error(''Tool call failed:'', error);
  }
};
```

## Configuration

### Production Setup

Set base URL for production:

```typescript
const server = new MCPServer({
  name: ''my-app'',
  version: ''1.0.0'',
  baseUrl: process.env.MCP_URL || ''https://myserver.com''
});
```

### Environment Variables

```env
# Server URL
MCP_URL=https://myserver.com

# For static deployments
MCP_SERVER_URL=https://myserver.com/api
CSP_URLS=https://cdn.example.com,https://api.example.com
```

**Variable usage:**
- `MCP_URL`: Base URL for widget assets and CSP
- `MCP_SERVER_URL`: MCP server URL for tool calls (static deployments)
- `CSP_URLS`: Additional domains for Content Security Policy

## Deployment

### Deploy to mcp-use Cloud

```bash
# Login
npx mcp-use login

# Deploy
yarn deploy
```

### Build for Production

```bash
# Build
yarn build

# Start
yarn start
```

Build process:
- Compiles TypeScript
- Bundles React widgets
- Optimizes assets
- Generates production HTML

## Common Patterns

### Data Fetching Widget

```tsx
const DataWidget: React.FC = () => {
  const { props, isPending, callTool } = useWidget();
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  const refresh = async () => {
    await callTool(''fetch-data'', { id: props.id });
  };
  
  return (
    <div>
      <h1>{props.title}</h1>
      <button onClick={refresh}>Refresh</button>
    </div>
  );
};
```

### Stateful Widget

```tsx
const CounterWidget: React.FC = () => {
  const { state, setState } = useWidget();
  
  const increment = async () => {
    await setState({ 
      count: (state?.count || 0) + 1 
    });
  };
  
  return (
    <div>
      <p>Count: {state?.count || 0}</p>
      <button onClick={increment}>+1</button>
    </div>
  );
};
```

### Themed Widget

```tsx
const ThemedWidget: React.FC = () => {
  const

<!-- truncated -->' WHERE slug = 'neversight-chatgpt-app-builder';