UPDATE skills SET content = '---
name: writing-typescript
description: Idiomatic TypeScript development. Use when writing TypeScript code, Node.js services, React apps, or discussing TS patterns. Emphasizes strict typing, composition, and modern tooling (bun/vite).
user-invocable: false
context: fork
agent: typescript-engineer
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
---

# TypeScript Development (5.x)

## Core Philosophy

1. **Strict Mode Always**
   - Enable all strict checks in tsconfig
   - Treat `any` as a bug—use `unknown` for untrusted input
   - noUncheckedIndexedAccess, exactOptionalPropertyTypes

2. **Interface vs Type**
   - interface for object shapes (extensible, mergeable)
   - type for unions, intersections, mapped types
   - interface for React props and public APIs

3. **Discriminated Unions**
   - Literal `kind`/`type` tag for variants
   - Exhaustive switch with never check
   - Model states as unions, not boolean flags

4. **Flat Control Flow**
   - Guard clauses with early returns
   - Type guards and predicate helpers
   - Maximum 2 levels of nesting

5. **Result Type Pattern**
   - Result<T, E> for explicit error handling
   - Discriminated union for success/failure
   - Custom Error subclasses for instanceof

## Quick Patterns

### Discriminated Unions (Not Boolean Flags)

```typescript
// GOOD: discriminated union for state
type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

// BAD: boolean flags
type LoadState = {
  isLoading: boolean;
  isError: boolean;
  data: T | null;
  error: string | null;
};
```

### Flat Control Flow (No Nesting)

```typescript
// GOOD: guard clauses, early returns
function process(user: User | null): Result<Data> {
  if (!user) return err("no user");
  if (!user.isActive) return err("inactive");
  if (user.role !== "admin") return err("not admin");
  return ok(doWork(user)); // happy path at end
}

// BAD: nested conditions
function process(user: User | null): Result<Data> {
  if (user) {
    if (user.isActive) {
      if (user.role === "admin") {
        return ok(doWork(user));
      }
    }
  }
  return err("invalid");
}
```

### Type Guards

```typescript
function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value
  );
}

// Predicate helper for flat code
const isActiveAdmin = (u: User | null): u is User & { role: "admin" } =>
  !!u && u.isActive && u.role === "admin";
```

### Result Type

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

async function fetchUser(
  id: string,
): Promise<Result<User, "not-found" | "network">> {
  try {
    const res = await fetch(`/users/${id}`);
    if (res.status === 404) return err("not-found");
    if (!res.ok) return err("network");
    return ok(await res.json());
  } catch {
    return err("network");
  }
}
```

### Exhaustive Switch

```typescript
function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "square":
      return shape.size ** 2;
    case "rect":
      return shape.width * shape.height;
    default: {
      const _exhaustive: never = shape; // Error if variant missed
      return _exhaustive;
    }
  }
}
```

## tsconfig.json Essentials

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "isolatedModules": true
  }
}
```

## References

- [PATTERNS.md](PATTERNS.md) - Code patterns and style
- [REACT.md](REACT.md) - React component patterns
- [TESTING.md](TESTING.md) - Testing with vitest

## Commands

```bash
bun install              # Install deps
bun run build            # Build
bun test                 # Test
bun run lint             # Lint
bun run format           # Format
```
' WHERE slug = 'neversight-writing-typescript';
UPDATE skills SET content = '---
name: error-handling-expert
description: Expert in error handling patterns, exception management, error responses, logging, and error recovery strategies for React, Next.js, and NestJS applications
---

# Error Handling Expert Skill

Expert in error handling patterns, exception management, error responses, logging, and error recovery strategies for React, Next.js, and NestJS applications.

## When to Use

- Implementing error handling
- Creating exception filters
- Designing error responses
- Setting up error logging
- Implementing error recovery
- Handling async errors
- Creating error boundaries
- Implementing retry logic

## Project Context Discovery

Before providing guidance:

1. Check `.agent/SYSTEM/ARCHITECTURE.md` for error patterns
2. Review existing exception filters
3. Check for error monitoring (Sentry, Rollbar)
4. Review logging libraries (Winston, Pino)

## Core Principles

### Error Types

**Application Errors:** 400, 401, 403, 404, 409, 422
**System Errors:** 500, 502, 503, 504

### Error Response Format

```typescript
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [...],
    "timestamp": "2025-01-01T00:00:00Z",
    "path": "/api/users",
    "requestId": "req-123456"
  }
}
```

## Quick Patterns

### NestJS Exception Filter

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Log, format, respond
  }
}
```

### React Error Boundary

```typescript
class ErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    // Log to monitoring
  }
}
```

### Retry with Backoff

```typescript
async function retryWithBackoff<T>(fn, maxRetries = 3): Promise<T>
```

## Best Practices

- User-friendly messages, no sensitive info
- Log all errors with context
- Integrate error monitoring (Sentry)
- Implement retry logic and circuit breakers
- Provide fallback values
- Test error cases

## Recovery Strategies

1. **Retry Logic** - Exponential backoff
2. **Circuit Breaker** - Prevent cascade failures
3. **Fallback Values** - Graceful degradation

---

**For complete exception filter implementations, custom exceptions, validation pipe setup, error boundaries, circuit breaker pattern, logging integration, and database/API error patterns, see:** `references/full-guide.md`
' WHERE slug = 'neversight-error-handling-expert';
UPDATE skills SET content = '---
name: react-flow-node-ts
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
' WHERE slug = 'neversight-react-flow-node-ts';
UPDATE skills SET content = '---
name: cloudflare-turnstile
description: |
  Add bot protection with Turnstile (CAPTCHA alternative). Use when: protecting forms, securing login/signup, preventing spam, migrating from reCAPTCHA, integrating with React/Next.js/Hono, implementing E2E tests, or debugging CSP errors, token validation failures, Chrome/Edge first-load issues, multiple widget rendering bugs, timeout-or-duplicate errors, or error codes 100*/106010/300*/600*.
user-invocable: true
---

# Cloudflare Turnstile

**Status**: Production Ready ✅
**Last Updated**: 2026-01-21
**Dependencies**: None (optional: @marsidev/react-turnstile for React)
**Latest Versions**: @marsidev/react-turnstile@1.4.1, turnstile-types@1.2.3

**Recent Updates (2025)**:
- **December 2025**: @marsidev/react-turnstile v1.4.1 fixes race condition in script loading
- **August 2025**: v1.3.0 adds `rerenderOnCallbackChange` prop for React closure issues
- **March 2025**: Upgraded Turnstile Analytics with TopN statistics (7 dimensions: hostnames, browsers, countries, user agents, ASNs, OS, source IPs), anomaly detection, enhanced bot behavior monitoring
- **January 2025**: Brief remoteip validation enforcement (resolved, but highlights importance of correct IP passing)
- **2025**: WCAG 2.1 AA compliance, Free plan (20 widgets, 7-day analytics), Enterprise features (unlimited widgets, ephemeral IDs, any hostname support, 30-day analytics, offlabel branding)

---

## Quick Start (5 Minutes)

```bash
# 1. Create widget: https://dash.cloudflare.com/?to=/:account/turnstile
#    Copy sitekey (public) and secret key (private)

# 2. Add widget to frontend
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<form>
  <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
  <button type="submit">Submit</button>
</form>

# 3. Validate token server-side (Cloudflare Workers)
const formData = await request.formData()
const token = formData.get(''cf-turnstile-response'')

const verifyFormData = new FormData()
verifyFormData.append(''secret'', env.TURNSTILE_SECRET_KEY)
verifyFormData.append(''response'', token)
verifyFormData.append(''remoteip'', request.headers.get(''CF-Connecting-IP''))  // REQUIRED - see Critical Rules

const result = await fetch(
  ''https://challenges.cloudflare.com/turnstile/v0/siteverify'',
  { method: ''POST'', body: verifyFormData }
)

const outcome = await result.json()
if (!outcome.success) return new Response(''Invalid'', { status: 401 })
```

**CRITICAL:**
- Token expires in 5 minutes, single-use only
- ALWAYS validate server-side (Siteverify API required)
- Never proxy/cache api.js (must load from Cloudflare CDN)
- Use different widgets for dev/staging/production

## Rendering Modes

**Implicit** (auto-render on page load):
```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY" data-callback="onSuccess"></div>
```

**Explicit** (programmatic control for SPAs):
```typescript
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script>
const widgetId = turnstile.render(''#container'', { sitekey: ''YOUR_SITE_KEY'' })
turnstile.reset(widgetId)   // Reset widget
turnstile.getResponse(widgetId)  // Get token
```

**React** (using @marsidev/react-turnstile):
```tsx
import { Turnstile } from ''@marsidev/react-turnstile''
<Turnstile siteKey={TURNSTILE_SITE_KEY} onSuccess={setToken} />
```

---

## Critical Rules

### Always Do

✅ **Call Siteverify API** - Server-side validation is mandatory
✅ **Use HTTPS** - Never validate over HTTP
✅ **Protect secret keys** - Never expose in frontend code
✅ **Handle token expiration** - Tokens expire after 5 minutes
✅ **Implement error callbacks** - Handle failures gracefully
✅ **Use dummy keys for testing** - Test sitekey: `1x00000000000000000000AA`
✅ **Set reasonable timeouts** - Don''t wait indefinitely for validation
✅ **Validate action/hostname** - Check additional fields when specified
✅ **Rotate keys periodically** - Use dashboard or API to rotate secrets
✅ **Monitor analytics** - Track solve rates and failures
✅ **Always pass client IP to Siteverify** - Use `CF-Connecting-IP` header (Workers) or `X-Forwarded-For` (Node.js). Cloudflare briefly enforced strict remoteip validation in Jan 2025, causing widespread failures for sites not passing correct IP

### Never Do

❌ **Skip server validation** - Client-side only = security vulnerability
❌ **Proxy api.js script** - Must load from Cloudflare CDN
❌ **Reuse tokens** - Each token is single-use only
❌ **Use GET requests** - Siteverify only accepts POST
❌ **Expose secret key** - Keep secrets in backend environment only
❌ **Trust client-side validation** - Tokens can be forged
❌ **Cache api.js** - Future updates will break your integration
❌ **Use production keys in tests** - Use dummy keys instead
❌ **Ignore error callbacks** - Always handle failures

---

## Known Issues Prevention

This skill prevents **15** documented issues:

### Issue #1: Missing Server-Side Validation
**Error**: Zero token validation in Turnstile Analytics dashboard
**Source**: https://developers.cloudflare.com/turnstile/get-started/
**Why It Happens**: Developers only implement client-side widget, skip Siteverify call
**Prevention**: All templates include mandatory server-side validation with Siteverify API

### Issue #2: Token Expiration (5 Minutes)
**Error**: `success: false` for valid tokens submitted after delay
**Source**: https://developers.cloudflare.com/turnstile/get-started/server-side-validation
**Why It Happens**: Tokens expire 300 seconds after generation
**Prevention**: Templates document TTL and implement token refresh on expiration

### Issue #3: Secret Key Exposed in Frontend
**Error**: Security bypass - attackers can validate their own tokens
**Source**: https://developers.cloudflare.com/turnstile/get-started/server-side-validation
**Why It Happens**: Secret key hardcoded in JavaScript or visible in source
**Prevention**: All templates show backend-only validation with environment variables

### Issue #4: GET Request to Siteverify
**Error**: API returns 405 Method Not Allowed
**Source**: https://developers.cloudflare.com/turnstile/migration/recaptcha
**Why It Happens**: reCAPTCHA supports GET, Turnstile requires POST
**Prevention**: Templates use POST with FormData or JSON body

### Issue #5: Content Security Policy Blocking
**Error**: Error 200500 - "Loading error: The iframe could not be loaded"
**Source**: https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes
**Why It Happens**: CSP blocks challenges.cloudflare.com iframe
**Prevention**: Skill includes CSP configuration reference and check-csp.sh script

### Issue #6: Widget Crash (Error 300030)
**Error**: Generic client execution error for legitimate users
**Source**: https://community.cloudflare.com/t/turnstile-is-frequently-generating-300x-errors/700903
**Why It Happens**: Unknown - appears to be Cloudflare-side issue (2025)
**Prevention**: Templates implement error callbacks, retry logic, and fallback handling

### Issue #7: Configuration Error (Error 600010)
**Error**: Widget fails with "configuration error"
**Source**: https://community.cloudflare.com/t/repeated-cloudflare-turnstile-error-600010/644578
**Why It Happens**: Missing or deleted hostname in widget configuration
**Prevention**: Templates document hostname allowlist requirement and verification steps

### Issue #8: Safari 18 / macOS 15 "Hide IP" Issue
**Error**: Error 300010 when Safari''s "Hide IP address" is enabled
**Source**: https://community.cloudflare.com/t/turnstile-is-frequently-generating-300x-errors/700903
**Why It Happens**: Privacy settings interfere with challenge signals
**Prevention**: Error handling reference documents Safari workaround (disable Hide IP)

### Issue #9: Brave Browser Confetti Animation Failure
**Error**: Verification fails during success animation
**Source**: https://github.com/brave/brave-browser/issues/45608 (April 2025)
**Why It Happens**: Brave shields block animation scripts
**Prevention**: Templates handle success before animation completes

### Issue #10: Next.js + Jest Incompatibility
**Error**: @marsidev/react-turnstile breaks Jest tests
**Source**: https://github.com/marsidev/react-turnstile/issues/112 (Oct 2025)
**Why It Happens**: Module resolution issues with Jest
**Prevention**: Testing guide includes Jest mocking patterns and dummy sitekey usage

### Issue #11: localhost Not in Allowlist
**Error**: Error 110200 - "Unknown domain: Domain not allowed"
**Source**: https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes
**Why It Happens**: Production widget used in development without localhost in allowlist
**Prevention**: Templates use dummy test keys for dev, document localhost allowlist requirement

### Issue #12: Token Reuse Attempt
**Error**: `success: false` with "token already spent" error
**Source**: https://developers.cloudflare.com/turnstile/troubleshooting/testing
**Why It Happens**: Each token can only be validated once. Turnstile tokens are single-use - after validation (success OR failure), the token is consumed and cannot be revalidated. Developers must explicitly call `turnstile.reset()` to generate a new token for subsequent submissions.
**Prevention**: Templates document single-use constraint and token refresh patterns

```typescript
// CRITICAL: Reset widget after validation to get new token
const turnstileRef = useRef(null)

async function handleSubmit(e) {
  e.preventDefault()
  const token = formData.get(''cf-turnstile-response'')

  const result = await fetch(''/api/submit'', {
    method: ''POST'',
    body: JSON.stringify({ token })
  })

  // Reset widget regardless of success/failure
  // Token is consumed either way
  if (turnstileRef.current) {
    turnstile.reset(turnstileRef.current)
  }
}

<Turnstile
  ref={turnstileRef}
  siteKey={TURNSTILE_SITE_KEY}
  onSuccess={setToken}
/>
```

### Issue #13: Error 106010 - Chrome/Edge First-Load Failure
**Error**: `106010` - "Generic parameter error" on first widget load in Chrome/Edge browsers
**Source**: [Cloudflare Error Codes](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/), [Community Report](https://community.cloudflare.com/t/turnstile-inconsistent-errors/856678)
**Why It Happens**: Unknown browser-specific issue affecting Chrome and Edge on first page load. Console shows 400 error to `https://challenges.cloudflare.com/cdn-cgi/challenge-platform`. Firefox is not affected. Subsequent page reloads work correctly.
**Prevention**: Implement error callback with auto-retry logic

```typescript
turnstile.render(''#container'', {
  sitekey: SITE_KEY,
  retry: ''auto'',
  ''retry-interval'': 8000,
  ''error-callback'': (errorCode) => {
    if (errorCode === ''106010'') {
      console.warn(''Chrome/Edge first-load issue (106010), auto-retrying...'')
      // Auto-retry will handle it
    }
  }
})
```

**Workaround**: Widget works correctly after page reload. Auto-retry setting resolves in most cases. Test in Incognito mode to rule out browser extensions. Review CSP rules to ensure Cloudflare Turnstile endpoints are allowed.

### Issue #14: Multiple Widgets Visual Status Stuck (Community-sourced)
**Error**: Widget displays "Pending..." status even after successful token generation
**Source**: [GitHub Issue #119](https://github.com/marsidev/react-turnstile/issues/119)
**Why It Happens**: CSS repaint issue when rendering multiple `<Turnstile/>` components on a single page. Only reproducible on full HD desktop screens. Token IS successfully generated (validation works), but visual status doesn''t update. Hovering over widget triggers repaint and shows correct status.
**Prevention**: Force CSS repaint in success callback

```tsx
<Turnstile
  siteKey={KEY}
  onSuccess={(token) => {
    setToken(token)
    // Force repaint by toggling display
    const widget = document.querySelector(''.cf-turnstile'')
    if (widget) {
      widget.style.display = ''none''
      setTimeout(() => widget.style.display = ''block'', 0)
    }
  }}
/>
```

**Note**: This is a visual-only issue, not a validation failure. The token is correctly generated and functional.

### Issue #15: Jest Compatibility with @marsidev/react-turnstile (Updated Dec 2025)
**Error**: `Jest encountered an unexpected token` when importing @marsidev/react-turnstile
**Source**: [GitHub Issue #114](https://github.com/marsidev/react-turnstile/issues/114), [GitHub Issue #112](https://github.com/marsidev/react-turnstile/issues/112)
**Why It Happens**: ESM module resolution issues with Jest 30.2.0 (latest as of Dec 2025). Issue #112 closed as "not planned" by maintainer. Jest users are stuck; Vitest migration works.
**Prevention**: Mock the Turnstile component in Jest setup OR migrate to Vitest

```typescript
// Option 1: Jest mocking (jest.setup.ts)
jest.mock(''@marsidev/react-turnstile'', () => ({
  Turnstile: () => <div data-testid="turnstile-mock" />,
}))

// Option 2: transformIgnorePatterns in jest.config.js
module.exports = {
  transformIgnorePatterns: [
    ''node_modules/(?!(@marsidev/react-turnstile)/)''
  ]
}

// Option 3 (Recommended): Migrate to Vitest
// Vitest handles ESM modules correctly without mocking
```

**Status**: Maintainer closed issue as "not planned". Recommend migrating to Vitest for new projects.

## Configuration

**wrangler.jsonc:**
```jsonc
{
  "vars": { "TURNSTILE_SITE_KEY": "1x00000000000000000000AA" },
  "secrets": ["TURNSTILE_SECRET_KEY"]  // Run: wrangler secret put TURNSTILE_SECRET_KEY
}
```

**Required CSP:**
```html
<meta http-equiv="Content-Security-Policy" content="
  script-src ''self'' https://challenges.cloudflare.com;
  frame-src ''self'' https://challenges.cloudflare.com;
">
```

---

## Common Patterns

### Pattern 1: Hono + Cloudflare Workers

```typescript
import { Hono } from ''hono''

type Bindings = {
  TURNSTILE_SECRET_KEY: string
  TURNSTILE_SITE_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.post(''/api/login'', async (c) => {
  const body = await c.req.formData()
  const token = body.get(''cf-turnstile-response'')

  if (!token) {
    return c.text(''Missing Turnstile token'', 400)
  }

  // Validate token
  const verifyFormData = new FormData()
  verifyFormData.append(''secret'', c.env.TURNSTILE_SECRET_KEY)
  verifyFormData.append(''response'', token.toString())
  verifyFormData.append(''remoteip'', c.req.header(''CF-Connecting-IP'') || '''')  // CRITICAL - always pass client IP

  const verifyResult = await fetch(
    ''https://challenges.cloudflare.com/turnstile/v0/siteverify'',
    {
      method: ''POST'',
      body: verifyFormData,
    }
  )

  const outcome = await verifyResult.json<{ success: boolean }>()

  if (!outcome.success) {
    return c.text(''Invalid Turnstile token'', 401)
  }

  // Process login
  return c.json({ message: ''Login successful'' })
})

export default app
```

**When to use**: API routes in Cloudflare Worke

<!-- truncated -->' WHERE slug = 'neversight-cloudflare-turnstile-ill-md';
UPDATE skills SET content = '---
name: vendure-admin-ui-writing
description: Create Vendure Admin UI extensions with React components, route registration, navigation menus, and GraphQL integration. Handles useQuery, useMutation, useInjector patterns. Use when building Admin UI features for Vendure plugins.
version: 1.0.0
---

# Vendure Admin UI Writing

## Purpose

Guide creation of Vendure Admin UI extensions following React patterns and official conventions.

## When NOT to Use

- Plugin structure only (use vendure-plugin-writing)
- GraphQL schema only (use vendure-graphql-writing)
- Reviewing UI code (use vendure-admin-ui-reviewing)

---

## FORBIDDEN Patterns

- Using Angular patterns (Vendure v2+ uses React)
- Direct fetch calls (use Vendure GraphQL hooks)
- Missing useInjector for services
- Hardcoded routes without registerReactRouteComponent
- Missing page metadata (title, breadcrumbs)
- Inline styles without CSS variables
- Missing loading and error states
- Direct DOM manipulation

---

## REQUIRED Patterns

- `@vendure/admin-ui/react` hooks for data fetching
- `useInjector(NotificationService)` for notifications
- `usePageMetadata()` for titles and breadcrumbs
- `registerReactRouteComponent()` for routes
- `addNavMenuSection()` for navigation
- Proper TypeScript types from generated GraphQL
- Loading states for async operations
- Error handling with user feedback

---

## Workflow

### Step 1: Create UI Extension Entry Point

```typescript
// ui/index.ts
import path from "path";
import { AdminUiExtension } from "@vendure/ui-devkit/compiler";

export const myPluginUiExtension: AdminUiExtension = {
  id: "my-plugin-ui",
  extensionPath: path.join(__dirname),
  routes: [
    {
      route: "my-plugin",
      filePath: "routes.ts",
    },
  ],
  providers: ["providers.ts"],
  translations: {
    en: path.join(__dirname, "translations/en.json"),
  },
};
```

### Step 2: Register Navigation Menu

```typescript
// ui/providers.ts
import { addNavMenuSection } from "@vendure/admin-ui/core";

export default [
  addNavMenuSection(
    {
      id: "my-plugin",
      label: "My Plugin",
      items: [
        {
          id: "my-items",
          label: "Items",
          routerLink: ["/extensions/my-plugin/items"],
          icon: "list",
        },
        {
          id: "my-settings",
          label: "Settings",
          routerLink: ["/extensions/my-plugin/settings"],
          icon: "cog",
        },
      ],
    },
    "settings",
  ), // Position after ''settings'' section
];
```

### Step 3: Register Routes

```typescript
// ui/routes.ts
import { registerReactRouteComponent } from "@vendure/admin-ui/react";

import { ItemList } from "./components/ItemList";
import { ItemDetail } from "./components/ItemDetail";
import { ItemForm } from "./components/ItemForm";

export default [
  registerReactRouteComponent({
    component: ItemList,
    path: "items",
    title: "Items",
    breadcrumb: "Items",
  }),
  registerReactRouteComponent({
    component: ItemDetail,
    path: "items/:id",
    title: "Item Details",
    breadcrumb: "Details",
  }),
  registerReactRouteComponent({
    component: ItemForm,
    path: "items/new",
    title: "New Item",
    breadcrumb: "New",
  }),
];
```

### Step 4: Create List Component

```typescript
// ui/components/ItemList.tsx
import { NotificationService } from ''@vendure/admin-ui/core'';
import {
    Card,
    ActionBar,
    Link,
    usePageMetadata,
    PageBlock,
    useQuery,
    useMutation,
    useInjector
} from ''@vendure/admin-ui/react'';
import * as React from ''react'';

import { GET_ITEMS, DELETE_ITEM } from ''../graphql'';
import { GetItemsQuery, DeleteItemMutation } from ''../gql/graphql'';

export function ItemList() {
    const { setTitle, setBreadcrumb } = usePageMetadata();
    const notificationService = useInjector(NotificationService);

    // Pagination state
    const [currentPage, setCurrentPage] = React.useState(1);
    const [itemsPerPage] = React.useState(25);

    // Set page metadata
    React.useEffect(() => {
        setTitle(''Items'');
        setBreadcrumb([
            { label: ''My Plugin'', link: [''/extensions/my-plugin''] },
            { label: ''Items'', link: [''/extensions/my-plugin/items''] }
        ]);
    }, [setTitle, setBreadcrumb]);

    // Query
    const { data, loading, error, refetch } = useQuery<GetItemsQuery>(GET_ITEMS, {
        variables: {
            options: {
                skip: (currentPage - 1) * itemsPerPage,
                take: itemsPerPage,
            }
        }
    });

    // Delete mutation
    const [deleteItem] = useMutation<DeleteItemMutation>(DELETE_ITEM);

    const handleDelete = React.useCallback(async (id: string) => {
        try {
            await deleteItem({ input: { id } });
            notificationService.success(''Item deleted'');
            await refetch();
        } catch {
            notificationService.error(''Failed to delete item'');
        }
    }, [deleteItem, notificationService, refetch]);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
        <PageBlock>
            <ActionBar>
                <div className="action-bar-start">
                    <h1>Items</h1>
                </div>
                <div className="action-bar-end">
                    <Link href="/extensions/my-plugin/items/new">
                        <button className="button primary">Add Item</button>
                    </Link>
                </div>
            </ActionBar>

            <Card>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.items.items.map(item => (
                            <tr key={item.id}>
                                <td>{item.name}</td>
                                <td>{new Date(item.createdAt).toLocaleDateString()}</td>
                                <td>
                                    <Link href={`/extensions/my-plugin/items/${item.id}`}>
                                        Edit
                                    </Link>
                                    <button onClick={() => void handleDelete(item.id)}>
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>
        </PageBlock>
    );
}
```

### Step 5: Create Detail/Form Component

```typescript
// ui/components/ItemDetail.tsx
import { NotificationService } from ''@vendure/admin-ui/core'';
import {
    usePageMetadata,
    PageBlock,
    useQuery,
    useMutation,
    useInjector,
    useRouteParams
} from ''@vendure/admin-ui/react'';
import * as React from ''react'';

import { GET_ITEM, UPDATE_ITEM } from ''../graphql'';

export function ItemDetail() {
    const { setTitle, setBreadcrumb } = usePageMetadata();
    const notificationService = useInjector(NotificationService);
    const { id } = useRouteParams();

    const [name, setName] = React.useState('''');

    // Query
    const { data, loading, error } = useQuery(GET_ITEM, {
        variables: { id }
    });

    // Mutation
    const [updateItem, { loading: saving }] = useMutation(UPDATE_ITEM);

    // Populate form when data loads
    React.useEffect(() => {
        if (data?.item) {
            setName(data.item.name);
            setTitle(data.item.name);
            setBreadcrumb([
                { label: ''Items'', link: [''/extensions/my-plugin/items''] },
                { label: data.item.name, link: [] }
            ]);
        }
    }, [data, setTitle, setBreadcrumb]);

    const handleSubmit = React.useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateItem({ input: { id, name } });
            notificationService.success(''Item updated'');
        } catch {
            notificationService.error(''Failed to update item'');
        }
    }, [id, name, updateItem, notificationService]);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
        <PageBlock>
            <form onSubmit={(e) => void handleSubmit(e)}>
                <div className="form-group">
                    <label htmlFor="name">Name</label>
                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" disabled={saving}>
                    {saving ? ''Saving...'' : ''Save''}
                </button>
            </form>
        </PageBlock>
    );
}
```

### Step 6: Set Up GraphQL Queries

```typescript
// ui/graphql/queries.ts
import { gql } from "graphql-tag";

export const GET_ITEMS = gql`
  query GetItems($options: ItemListOptions) {
    items(options: $options) {
      items {
        id
        name
        createdAt
        updatedAt
      }
      totalItems
    }
  }
`;

export const GET_ITEM = gql`
  query GetItem($id: ID!) {
    item(id: $id) {
      id
      name
      createdAt
      updatedAt
    }
  }
`;
```

```typescript
// ui/graphql/mutations.ts
import { gql } from "graphql-tag";

export const CREATE_ITEM = gql`
  mutation CreateItem($input: CreateItemInput!) {
    createItem(input: $input) {
      id
      name
    }
  }
`;

export const UPDATE_ITEM = gql`
  mutation UpdateItem($input: UpdateItemInput!) {
    updateItem(input: $input) {
      id
      name
    }
  }
`;

export const DELETE_ITEM = gql`
  mutation DeleteItem($input: DeleteItemInput!) {
    deleteItem(input: $input)
  }
`;
```

### Step 7: Configure GraphQL Codegen

```yaml
# ui/codegen.yml
schema: http://localhost:3000/admin-api
documents: "./ui/graphql/**/*.ts"
generates:
  ./ui/gql/graphql.ts:
    plugins:
      - typescript
      - typescript-operations
    config:
      avoidOptionals: true
      maybeValue: T | null
```

---

## Common Patterns

For detailed patterns with code examples, see `references/PATTERNS.md`.

## Examples

For complete working examples, see `references/EXAMPLES.md`.

## Project Structure

```
ui/
├── index.ts              # AdminUiExtension entry point
├── providers.ts          # Navigation registration
├── routes.ts             # Route registration
├── codegen.yml           # GraphQL codegen config
├── components/
│   ├── ItemList.tsx
│   ├── ItemDetail.tsx
│   ├── ItemForm.tsx
│   └── common/
│       ├── ConfirmDialog.tsx
│       └── LoadingState.tsx
├── graphql/
│   ├── index.ts          # Re-exports
│   ├── queries.ts
│   ├── mutations.ts
│   └── fragments.ts
├── gql/
│   └── graphql.ts        # Generated types
├── hooks/
│   └── useItems.ts
├── styles/
│   └── common.css
└── translations/
    └── en.json
```

---

## Troubleshooting

| Problem                  | Cause                   | Solution                                          |
| ------------------------ | ----------------------- | ------------------------------------------------- |
| Component not rendering  | Route not registered    | Add to routes.ts with registerReactRouteComponent |
| Nav item missing         | Provider not loaded     | Add to providers.ts, ensure exported as default   |
| Query returns undefined  | Missing generated types | Run graphql-codegen                               |
| Notification not showing | Missing useInjector     | Use useInjector(NotificationService)              |
| Page title wrong         | Missing usePageMetadata | Call setTitle in useEffect                        |

---

## Related Skills

- **vendure-admin-ui-reviewing** - UI review
- **vendure-plugin-writing** - Plugin structure
- **vendure-graphql-writing** - GraphQL schema
' WHERE slug = 'neversight-vendure-admin-ui-writing';
UPDATE skills SET content = '---
name: Supabase React Best Practices
description: Comprehensive guide for building production-ready React applications with Supabase, TypeScript, and TanStack Query. Use when implementing auth, data fetching, real-time features, or optimizing Supabase integration.
---

# Supabase + React Best Practices

Expert guide for building scalable, performant React applications with Supabase.

## When to Use This Skill

- Setting up new Supabase + React project
- Implementing authentication flows
- Creating data fetching hooks with TanStack Query
- Adding real-time subscriptions
- Optimizing database queries
- Setting up TypeScript types
- Debugging Supabase integration issues

---

## Quick Start Checklist

```typescript
// ✅ Essential Setup
- [ ] Install: @supabase/supabase-js @tanstack/react-query
- [ ] Generate TypeScript types from schema
- [ ] Create typed Supabase client
- [ ] Set up TanStack Query provider
- [ ] Configure environment variables
- [ ] Set up auth context/provider
```

---

## 1. Project Structure (Best Practice)

```
src/
├── integrations/
│   └── supabase/
│       ├── client.ts          # Supabase client singleton
│       ├── types.ts           # Generated DB types
│       └── auth.tsx           # Auth context provider
├── features/
│   └── [feature]/
│       ├── hooks/
│       │   ├── use[Feature].ts       # Query hooks
│       │   └── use[Feature]Mutations.ts  # Mutation hooks
│       ├── components/
│       └── types.ts
└── lib/
    └── queryClient.ts         # TanStack Query config
```

**Why This Structure:**
- Clear separation of concerns
- Reusable hooks across features
- Type safety throughout
- Easy to test and maintain

---

## 2. TypeScript Setup (CRITICAL)

### Generate Types from Database

```bash
# Generate types (run after every migration)
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/integrations/supabase/types.ts

# Or use local
npx supabase gen types typescript --local > src/integrations/supabase/types.ts
```

### Create Typed Client

**File:** `src/integrations/supabase/client.ts`

```typescript
import { createClient } from ''@supabase/supabase-js'';
import type { Database } from ''./types'';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(''Missing Supabase environment variables'');
}

// ✅ Typed Supabase client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Export types for convenience
export type Tables<T extends keyof Database[''public''][''Tables'']> =
  Database[''public''][''Tables''][T][''Row''];
export type Enums<T extends keyof Database[''public''][''Enums'']> =
  Database[''public''][''Enums''][T];
```

**Benefits:**
- Full IntelliSense for all tables
- Type-safe queries
- Catch errors at compile time
- Better refactoring support

---

## 3. Authentication Patterns

### Pattern 1: Auth Context Provider (Recommended)

**File:** `src/integrations/supabase/auth.tsx`

```typescript
import { createContext, useContext, useEffect, useState } from ''react'';
import { User, Session } from ''@supabase/supabase-js'';
import { supabase } from ''./client'';

interface AuthContext {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContext | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(''useAuth must be used within AuthProvider'');
  }
  return context;
};
```

**Usage:**

```typescript
// App.tsx
import { AuthProvider } from ''@/integrations/supabase/auth'';

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

// In components
function Profile() {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" />;

  return <div>Welcome {user.email}</div>;
}
```

### Pattern 2: Protected Routes

```typescript
import { Navigate, Outlet } from ''react-router-dom'';
import { useAuth } from ''@/integrations/supabase/auth'';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

// In router config
<Route element={<ProtectedRoute />}>
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/profile" element={<Profile />} />
</Route>
```

---

## 4. Data Fetching with TanStack Query

### Setup Query Client

**File:** `src/lib/queryClient.ts`

```typescript
import { QueryClient } from ''@tanstack/react-query'';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

### Query Hooks Pattern

**File:** `src/features/events/hooks/useEvents.ts`

```typescript
import { useQuery } from ''@tanstack/react-query'';
import { supabase } from ''@/integrations/supabase/client'';
import type { Tables } from ''@/integrations/supabase/client'';

type Event = Tables<''events''>;

/**
 * Fetch all published events
 *
 * @example
 * const { data, isLoading, error } = useEvents();
 */
export function useEvents() {
  return useQuery({
    queryKey: [''events''],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(''events'')
        .select(''*'')
        .eq(''status'', ''published'')
        .order(''start_at'', { ascending: true });

      if (error) throw error;
      return data as Event[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch single event by ID
 */
export function useEvent(id: string) {
  return useQuery({
    queryKey: [''event'', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(''events'')
        .select(''*, venue:venues(*)'')
        .eq(''id'', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id, // Only run if ID provided
    staleTime: 5 * 60 * 1000,
  });
}
```

### Mutation Hooks Pattern

**File:** `src/features/events/hooks/useEventMutations.ts`

```typescript
import { useMutation, useQueryClient } from ''@tanstack/react-query'';
import { supabase } from ''@/integrations/supabase/client'';
import type { Tables } from ''@/integrations/supabase/client'';

type EventInsert = Tables<''events''>[''Insert''];
type EventUpdate = Tables<''events''>[''Update''];

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: EventInsert) => {
      const { data, error } = await supabase
        .from(''events'')
        .insert(event)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate queries to refetch
      queryClient.invalidateQueries({ queryKey: [''events''] });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & EventUpdate) => {
      const { data, error } = await supabase
        .from(''events'')
        .update(updates)
        .eq(''id'', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Invalidate list and single item
      queryClient.invalidateQueries({ queryKey: [''events''] });
      queryClient.invalidateQueries({ queryKey: [''event'', data.id] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(''events'')
        .delete()
        .eq(''id'', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [''events''] });
    },
  });
}
```

**Usage in Components:**

```typescript
function EventForm() {
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();

  const handleSubmit = async (values) => {
    try {
      if (editMode) {
        await updateEvent.mutateAsync({ id: eventId, ...values });
        toast.success(''Event updated!'');
      } else {
        await createEvent.mutateAsync(values);
        toast.success(''Event created!'');
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

---

## 5. Real-Time Subscriptions

### Pattern: Real-Time Hook

```typescript
import { useEffect } from ''react'';
import { useQueryClient } from ''@tanstack/react-query'';
import { supabase } from ''@/integrations/supabase/client'';

export function useEventsSubscription() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(''events-changes'')
      .on(
        ''postgres_changes'',
        {
          event: ''*'',
          schema: ''public'',
          table: ''events'',
        },
        (payload) => {
          console.log(''Event change:'', payload);

          // Invalidate queries to refetch
          queryClient.invalidateQueries({ queryKey: [''events''] });

          // Or update cache directly (optimistic)
          if (payload.eventType === ''INSERT'') {
            queryClient.setQueryData([''events''], (old: any[]) => [
              ...(old || []),
              payload.new,
            ]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

// Usage
function EventsList() {
  const { data: events, isLoading } = useEvents();
  useEventsSubscription(); // Auto-refetch on changes

  return <div>{events?.map(...)}</div>;
}
```

---

## 6. Advanced Query Patterns

### Filtering with Parameters

```typescript
export function useEvents(filters?: {
  status?: string;
  type?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: [''events'', filters],
    queryFn: async () => {
      let query = supabase
        .from(''events'')
        .select(''*'');

      if (filters?.status) {
        query = query.eq(''status'', filters.status);
      }

      if (filters?.type) {
        query = query.eq(''type'', filters.type);
      }

      if (filters?.search) {
        query = query.ilike(''name'', `%${filters.search}%`);
      }

      const { data, error } = await query.order(''start_at'', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: true,
  });
}
```

### Pagination

```typescript
export function useEventsPaginated(page: number, pageSize: number = 10) {
  return useQuery({
    queryKey: [''events'', ''paginated'', page, pageSize],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from(''events'')
        .select(''*'', { count: ''exact'' })
        .range(from, to)
        .order(''start_at'', { ascending: false });

      if (error) throw error;

      return {
        events: data,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
  });
}
```

### Complex Joins

```typescript
export function useEventWithDetails(id: string) {
  return useQuery({
    queryKey: [''event'', ''details'', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(''events'')
        .select(`
          *,
          venue:venues(*),
          organizer:profiles(id, full_name, avatar_url),
          tickets:ticket_tiers(*),
          bookings:orders(
            id,
            status,
            total_amount,
            attendee:attendees(*)
          )
        `)
        .eq(''id'', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}
```

---

## 7. Row Level Security (RLS) Best Practices

### Understanding RLS in React

**Problem:** Your React app uses the `anon` key, which has limited permissions.

**Solution:** RLS policies control what data users can access based on `auth.uid()`.

### Testing RLS Policies

```typescript
// Helper to test if user can access data
export async function testRLS() {
  const { data: { user } } = await supabase.auth.getUser();

  console.log(''Current user:'', user?.id);

  // Test read access
  const { data, error } = await supabase
    .from(''events'')
    .select(''*'');

  if (error) {
    console.error(''RLS blocking access:'', error);
  } else {
    console.log(''Accessible events:'', data);
  }
}
```

### Common RLS Patterns for React

```sql
-- Allow public read, authenticated insert
CREATE POLICY "Public events are viewable by everyone"
  ON events FOR SELECT
  USING (visibility = ''public'');

CREATE POLICY "Users can insert their own events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Users can update their own events"
  ON events FOR UPDATE
  USING (auth.uid() = organizer_id);
```

### Handling RLS Errors in React

```typescript
export function useEvents() {
  return useQuery({
    queryKey: [''events''],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(''events'')
        .select(''*'');

      // RLS will return error if blocked
      if (error) {
        if (error.code === ''PGRST301'') {
          throw new Error(''You do not have permission to view these events'');
        }
        throw error;
      }

      return data;
    },
    retry: false, // Do

<!-- truncated -->' WHERE slug = 'neversight-supabase-react-best-practices';
UPDATE skills SET content = '---
name: folder-structure
description: Enforce specific directory structure for React and MobX Projects.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit]
globs: src/**
best_practices:
  - Follow the guidelines consistently
  - Apply rules during code review
  - Use as reference when writing new code
error_handling: graceful
streaming: supported
---

# Folder Structure Skill

<identity>
You are a coding standards expert specializing in folder structure.
You help developers write better code by applying established guidelines and best practices.
</identity>

<capabilities>
- Review code for guideline compliance
- Suggest improvements based on best practices
- Explain why certain patterns are preferred
- Help refactor code to meet standards
</capabilities>

<instructions>
When reviewing or writing code, apply these guidelines:

- Maintain following folder structure:
  src/
  components/
  stores/
  hooks/
  pages/
  utils/
  </instructions>

<examples>
Example usage:
```
User: "Review this code for folder structure compliance"
Agent: [Analyzes code against guidelines and provides specific feedback]
```
</examples>

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

**After completing:** Record any new patterns or exceptions discovered.

> ASSUME INTERRUPTION: Your context may reset. If it''s not in memory, it didn''t happen.
' WHERE slug = 'neversight-folder-structure';
UPDATE skills SET content = '---
name: openai-agents
description: |
  Build AI applications with OpenAI Agents SDK - text agents, voice agents (realtime), multi-agent workflows with handoffs, tools with Zod schemas, input/output guardrails, structured outputs, and streaming. Deploy to Cloudflare Workers, Next.js, or React with human-in-the-loop patterns.

  Use when: building text-based agents with tools and Zod schemas, creating realtime voice agents with WebRTC/WebSocket, implementing multi-agent workflows with handoffs between specialists, setting up input/output guardrails for safety, requiring human approval for critical actions, streaming agent responses, deploying agents to Cloudflare Workers or Next.js, or troubleshooting Zod schema type errors, MCP tracing failures, infinite loops (MaxTurnsExceededError), tool call failures, schema mismatches, or voice agent handoff constraints.
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
17. `tracing-setup.ts` - Debugging

---

## References

1. `agent-patterns.md` - Orchestration strategies
2. `common-errors.md` - 9 errors with workarounds
3. `realtime-transports.md` - WebRTC vs WebSocket
4. `cloudflare-integration.md` - Workers limitations
5. `official-links.md` - Documentation links

---

## Official Resources

- **Docs**: https://openai.github.io/openai-agents-js/
- **GitHub**: htt

<!-- truncated -->' WHERE slug = 'neversight-openai-agents';
UPDATE skills SET content = '---
name: zustand-game-patterns
description: Zustand state management patterns optimized for games including persistence, undo/redo, time-travel debugging, subscriptions, and performance optimization. Use when designing game state architecture, implementing save/load, optimizing re-renders, or debugging state issues. Triggers on requests involving Zustand stores, game state management, state persistence, or React performance in games.
---

# Zustand Game Patterns

Production-ready patterns for managing complex game state with Zustand.

## Store Architecture

### Modular Store Pattern

Split large game state into focused slices:

```typescript
// stores/slices/timeSlice.ts
import { StateCreator } from ''zustand'';
import { GameState } from ''../types'';

export interface TimeSlice {
  time: GameTime;
  advancePhase: () => void;
  setDay: (day: number) => void;
}

export const createTimeSlice: StateCreator<
  GameState,
  [[''zustand/immer'', never]],
  [],
  TimeSlice
> = (set) => ({
  time: { season: 1, day: 1, phase: ''morning'' },
  
  advancePhase: () => set((state) => {
    const phases = [''morning'', ''action'', ''resolution'', ''night''];
    const idx = phases.indexOf(state.time.phase);
    state.time.phase = phases[(idx + 1) % 4];
    if (idx === 3) state.time.day = Math.min(state.time.day + 1, 42);
  }),
  
  setDay: (day) => set((state) => {
    state.time.day = Math.max(1, Math.min(day, 42));
  }),
});
```

### Combining Slices

```typescript
// stores/gameStore.ts
import { create } from ''zustand'';
import { immer } from ''zustand/middleware/immer'';
import { subscribeWithSelector } from ''zustand/middleware'';
import { createTimeSlice, TimeSlice } from ''./slices/timeSlice'';
import { createResourceSlice, ResourceSlice } from ''./slices/resourceSlice'';
import { createHexSlice, HexSlice } from ''./slices/hexSlice'';

type GameState = TimeSlice & ResourceSlice & HexSlice;

export const useGameStore = create<GameState>()(
  subscribeWithSelector(
    immer((...args) => ({
      ...createTimeSlice(...args),
      ...createResourceSlice(...args),
      ...createHexSlice(...args),
    }))
  )
);
```

## Persistence

### Local Storage Save/Load

```typescript
import { persist, createJSONStorage } from ''zustand/middleware'';

export const useGameStore = create<GameState>()(
  persist(
    subscribeWithSelector(
      immer((set, get) => ({
        // ... state and actions
      }))
    ),
    {
      name: ''game-save'',
      storage: createJSONStorage(() => localStorage),
      
      // Only persist specific fields
      partialize: (state) => ({
        time: state.time,
        resources: state.resources,
        score: state.score,
        // Exclude transient state like selectedHex
      }),
      
      // Handle version migrations
      version: 1,
      migrate: (persisted, version) => {
        if (version === 0) {
          // Migration from v0 to v1
          return { ...persisted, newField: ''default'' };
        }
        return persisted;
      },
    }
  )
);
```

### Multiple Save Slots

```typescript
interface SaveSlot {
  id: string;
  name: string;
  timestamp: number;
  data: Partial<GameState>;
}

const SAVE_SLOTS_KEY = ''game-saves'';

export const saveToSlot = (slotId: string, name: string) => {
  const state = useGameStore.getState();
  const saves = JSON.parse(localStorage.getItem(SAVE_SLOTS_KEY) || ''[]'');
  
  const saveData: SaveSlot = {
    id: slotId,
    name,
    timestamp: Date.now(),
    data: {
      time: state.time,
      resources: state.resources,
      score: state.score,
      hexes: Object.fromEntries(state.hexes),
    },
  };
  
  const idx = saves.findIndex((s: SaveSlot) => s.id === slotId);
  if (idx >= 0) saves[idx] = saveData;
  else saves.push(saveData);
  
  localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(saves));
};

export const loadFromSlot = (slotId: string) => {
  const saves = JSON.parse(localStorage.getItem(SAVE_SLOTS_KEY) || ''[]'');
  const slot = saves.find((s: SaveSlot) => s.id === slotId);
  
  if (slot) {
    useGameStore.setState({
      ...slot.data,
      hexes: new Map(Object.entries(slot.data.hexes || {})),
    });
  }
};
```

## Undo/Redo (Time Travel)

```typescript
import { temporal } from ''zundo'';

export const useGameStore = create<GameState>()(
  temporal(
    immer((set) => ({
      // ... state and actions
    })),
    {
      // Limit history size
      limit: 50,
      
      // Only track specific changes
      partialize: (state) => ({
        hexes: state.hexes,
        resources: state.resources,
      }),
      
      // Equality check to prevent duplicate history
      equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    }
  )
);

// Usage
const { undo, redo, pastStates, futureStates } = useGameStore.temporal.getState();
```

## Subscriptions & Side Effects

### Subscribe to State Changes

```typescript
// Subscribe outside React
const unsubscribe = useGameStore.subscribe(
  (state) => state.time.phase,
  (phase, prevPhase) => {
    console.log(`Phase changed: ${prevPhase} → ${phase}`);
    
    // Trigger side effects
    if (phase === ''morning'') {
      useGameStore.getState().spawnTrouble();
    }
  }
);

// Subscribe to multiple selectors
useGameStore.subscribe(
  (state) => ({ day: state.time.day, phase: state.time.phase }),
  ({ day, phase }) => {
    // Analytics tracking
    analytics.track(''game_progress'', { day, phase });
  },
  { equalityFn: shallow }
);
```

### React Subscription Hook

```typescript
import { useEffect } from ''react'';
import { useShallow } from ''zustand/react/shallow'';

// Optimized selector with shallow comparison
export const useGameTime = () => useGameStore(
  useShallow((state) => ({
    day: state.time.day,
    phase: state.time.phase,
    season: state.time.season,
  }))
);

// Effect on state change
export const usePhaseEffects = () => {
  const phase = useGameStore((s) => s.time.phase);
  
  useEffect(() => {
    if (phase === ''resolution'') {
      // Play resolution animation
      playSound(''phase_change'');
    }
  }, [phase]);
};
```

## Performance Optimization

### Selector Memoization

```typescript
// ❌ Bad: Creates new object every render
const { time, resources } = useGameStore((state) => ({
  time: state.time,
  resources: state.resources,
}));

// ✅ Good: Use shallow comparison
import { useShallow } from ''zustand/react/shallow'';

const { time, resources } = useGameStore(
  useShallow((state) => ({
    time: state.time,
    resources: state.resources,
  }))
);

// ✅ Best: Separate selectors for independent updates
const time = useGameStore((s) => s.time);
const resources = useGameStore((s) => s.resources);
```

### Computed Selectors

```typescript
// Create memoized selectors for derived state
import { createSelector } from ''reselect'';

const selectTroubles = (state: GameState) => state.troubles;
const selectGridSize = (state: GameState) => state.gridSize;

export const selectTroubleCount = createSelector(
  [selectTroubles],
  (troubles) => Object.keys(troubles).length
);

export const selectTotalTroubleHexes = createSelector(
  [selectTroubles],
  (troubles) => Object.values(troubles)
    .reduce((sum, t) => sum + t.hexCoords.length, 0)
);

// Usage
const troubleCount = useGameStore(selectTroubleCount);
```

### Batched Updates

```typescript
// Batch multiple state changes
const endDay = () => {
  useGameStore.setState((state) => {
    // All updates in single render
    state.metaPots.activeBets = [];
    state.time.phase = ''morning'';
    state.time.day += 1;
    state.resources.stamina = 100;
  });
};
```

## Devtools Integration

```typescript
import { devtools } from ''zustand/middleware'';

export const useGameStore = create<GameState>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        // ... state and actions
        
        // Named actions for devtools
        advancePhase: () => set(
          (state) => { /* ... */ },
          false,
          ''time/advancePhase'' // Action name in devtools
        ),
      }))
    ),
    {
      name: ''GameStore'',
      enabled: process.env.NODE_ENV === ''development'',
    }
  )
);
```

## Testing Patterns

```typescript
// Reset store between tests
beforeEach(() => {
  useGameStore.setState({
    time: { season: 1, day: 1, phase: ''morning'' },
    resources: { tulipBulbs: 10, coins: 3000, stamina: 100 },
    // ... initial state
  });
});

// Test actions
test(''advancePhase cycles through phases'', () => {
  const { advancePhase } = useGameStore.getState();
  
  expect(useGameStore.getState().time.phase).toBe(''morning'');
  advancePhase();
  expect(useGameStore.getState().time.phase).toBe(''action'');
  advancePhase();
  expect(useGameStore.getState().time.phase).toBe(''resolution'');
});

// Test subscriptions
test(''spawns trouble on morning phase'', () => {
  const spawnTrouble = vi.spyOn(useGameStore.getState(), ''spawnTrouble'');
  
  // Advance to morning
  useGameStore.setState({ time: { ...initialTime, phase: ''night'' } });
  useGameStore.getState().advancePhase();
  
  expect(spawnTrouble).toHaveBeenCalled();
});
```
' WHERE slug = 'neversight-zustand-game-patterns';
UPDATE skills SET content = '---
name: shadcn-code-review
description: Reviews shadcn/ui components for CVA patterns, composition with asChild, accessibility states, and data-slot usage. Use when reviewing React components using shadcn/ui, Radix primitives, or Tailwind styling.
---

# shadcn/ui Code Review

## Quick Reference

| Issue Type | Reference |
|------------|-----------|
| className in CVA, missing VariantProps, compound variants | [references/cva-patterns.md](references/cva-patterns.md) |
| asChild without Slot, missing Context, component composition | [references/composition.md](references/composition.md) |
| Missing focus-visible, aria-invalid, disabled states | [references/accessibility.md](references/accessibility.md) |
| Missing data-slot, incorrect CSS targeting | [references/data-slot.md](references/data-slot.md) |

## Review Checklist

- [ ] `cn()` receives className, not CVA variants
- [ ] `VariantProps<typeof variants>` exported for consumers
- [ ] Compound variants used for complex state combinations
- [ ] `asChild` pattern uses `@radix-ui/react-slot`
- [ ] Context used for component composition (Card, Accordion, etc.)
- [ ] `focus-visible:` states, not just `:focus`
- [ ] `aria-invalid`, `aria-disabled` for form states
- [ ] `disabled:` variants for all interactive elements
- [ ] `sr-only` for screen reader text
- [ ] `data-slot` attributes for targetable composition parts
- [ ] CSS uses `has()` selectors for state-based styling
- [ ] No direct className overrides of variant styles

## Valid Patterns (Do NOT Flag)

These are correct patterns that should NOT be flagged as issues:

- `max-h-(--var)` - correct Tailwind v4 CSS variable syntax (NOT v3 bracket notation)
- `text-[color:var(--x)]` - valid arbitrary value syntax
- Copying shadcn component code into project - intended usage pattern
- Not documenting copied shadcn components - library internals, not custom code
- Using cn() with many arguments - composition is the pattern
- Conditional classes in cn() arrays - valid Tailwind pattern
- Extending primitive components without additional docs - well-known base

## Context-Sensitive Rules

Apply these rules with appropriate context awareness:

- Flag accessibility issues ONLY IF not handled by Radix primitives underneath
- Flag missing aria labels ONLY IF component isn''t using accessible radix primitive
- Flag variant proliferation ONLY IF variants could be composed from existing
- Flag component documentation ONLY IF it''s custom code, not copied shadcn

## Library Convention Note

shadcn/ui components are designed to be copied and modified. Code review should focus on:
- Custom modifications made to copied components
- Integration with application state/data
- Accessibility in custom usage contexts

Do NOT flag:
- Standard shadcn component internals
- Radix primitive usage patterns
- Default variant implementations

## When to Load References

- Reviewing variant definitions → cva-patterns.md
- Reviewing component composition with asChild → composition.md
- Reviewing form components or interactive elements → accessibility.md
- Reviewing multi-part components (Card, Select, etc.) → data-slot.md

## Review Questions

1. Are CVA variants properly separated from className props?
2. Does asChild composition work correctly with Slot?
3. Are all accessibility states (focus, invalid, disabled) handled?
4. Are data-slot attributes used for component part targeting?
5. Can consumers extend variants without breaking composition?

## Before Submitting Findings

Load and follow [review-verification-protocol](../review-verification-protocol/SKILL.md) before reporting any issue.
' WHERE slug = 'neversight-shadcn-code-review';