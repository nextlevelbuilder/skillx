UPDATE skills SET content = '---
name: providers
description: Create, configure, and centralize React providers in src/providers/. Use when creating new providers, setting up context providers, or organizing provider structure.
scope: [stores,app-router]
---

# React Providers

## Structure

All providers go in `src/providers/` with this structure:

```txt
src/providers/
├── ProviderName.tsx    # Individual provider
├── AppProviders.tsx   # Central provider wrapper
└── index.ts           # Exports
```

## Creating a Provider

### Individual Provider

```tsx
// src/providers/ThemeProvider.tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface ThemeContextType {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
```

### Provider with Configuration

```tsx
// src/providers/QueryProvider.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 3,
          },
          mutations: {
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

## Centralizing Providers

All providers must be imported and composed in `AppProviders.tsx`:

```tsx
// src/providers/AppProviders.tsx
"use client";

import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components";
import { QueryProvider } from "./QueryProvider";
import { ThemeProvider } from "./ThemeProvider";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
```

## Exporting Providers

Export all providers from `index.ts`:

```tsx
// src/providers/index.ts
export { QueryProvider } from "./QueryProvider";
export { ThemeProvider, useTheme } from "./ThemeProvider";
export { AppProviders } from "./AppProviders";
```

## Usage in Root Layout

Use `AppProviders` in the root `layout.tsx`:

```tsx
// src/app/layout.tsx
import { AppProviders } from "@/providers";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
```

## Important Rules

- **Always use "use client"** directive for client-side providers
- **Compose all providers** in `AppProviders.tsx`
- **Export from index.ts** for easy imports
- **Use TypeScript** - define proper types for context values
- **Avoid `any` type** - use proper types or `unknown` if needed
- **Provider order matters** - outer providers can''t access inner providers
- **ErrorBoundary should be outermost** to catch all errors

## Provider Order

Recommended order in `AppProviders`:

1. `ErrorBoundary` (outermost - catches all errors)
2. `QueryProvider` (data fetching)
3. Theme/UI providers
4. Feature-specific providers
5. Children (innermost)

## Custom Hooks

If a provider exposes a custom hook, export it from the provider file and from `index.ts`:

```tsx
// src/providers/ThemeProvider.tsx
export function useTheme() {
  // ... implementation
}

// src/providers/index.ts
export { ThemeProvider, useTheme } from "./ThemeProvider";
```
' WHERE slug = 'jorggerojas-providers-ill-md';
UPDATE skills SET content = '---
name: react-best-practices
description: React performance optimization guidelines from Vercel Engineering, with EquipQR-specific mappings (Vite + React Router + TanStack Query). Use when writing, reviewing, or refactoring React code in this repo, especially around waterfalls, bundle size, and re-renders.
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
  source_repo: vercel-labs/agent-skills
  source_commit: c4399b192588e71fdf0cb507c7b6ad9e9657ce6b
  adapted_for: EquipQR
---

# React Best Practices (Vercel, adapted for EquipQR)

Comprehensive performance optimization guide for React and Next.js applications, maintained by Vercel. Contains 57 rules across 8 categories, prioritized by impact to guide automated refactoring and code generation.

## EquipQR applicability notes (important)

This repository is **Vite + React Router + TypeScript** (not Next.js). When applying these rules:

- **Next.js-only APIs**: Ignore or translate examples referencing `next/dynamic`, Route Handlers (`export async function GET`), Server Actions (`"use server"`), RSC boundaries, or `after()`. Prefer the *underlying principle* (avoid waterfalls, reduce payload, parallelize independent work).
- **Client data fetching**: Examples mention **SWR**; EquipQR uses **TanStack Query v5**. Apply the dedup/caching principles using React Query patterns (query keys, caching, de-duping via in-flight queries).
- **Code splitting**: Translate `next/dynamic` to `React.lazy(() => import(...))` + `<Suspense>` (and route-level splitting where appropriate).
- **Imports & bundle size**: The “avoid barrel imports” guidance still applies—prefer direct imports and avoid `index.ts` re-export barrels in hot paths.

## When to Apply

Reference these guidelines when:
- Writing new React components or Next.js pages
- Implementing data fetching (client or server-side)
- Reviewing code for performance issues
- Refactoring existing React/Next.js code
- Optimizing bundle size or load times

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Server-Side Performance | HIGH | `server-` |
| 4 | Client-Side Data Fetching | MEDIUM-HIGH | `client-` |
| 5 | Re-render Optimization | MEDIUM | `rerender-` |
| 6 | Rendering Performance | MEDIUM | `rendering-` |
| 7 | JavaScript Performance | LOW-MEDIUM | `js-` |
| 8 | Advanced Patterns | LOW | `advanced-` |

## Quick Reference

### 1. Eliminating Waterfalls (CRITICAL)

- `async-defer-await` - Move await into branches where actually used
- `async-parallel` - Use Promise.all() for independent operations
- `async-dependencies` - Use better-all for partial dependencies
- `async-api-routes` - Start promises early, await late in API routes
- `async-suspense-boundaries` - Use Suspense to stream content

### 2. Bundle Size Optimization (CRITICAL)

- `bundle-barrel-imports` - Import directly, avoid barrel files
- `bundle-dynamic-imports` - Use next/dynamic for heavy components
- `bundle-defer-third-party` - Load analytics/logging after hydration
- `bundle-conditional` - Load modules only when feature is activated
- `bundle-preload` - Preload on hover/focus for perceived speed

### 3. Server-Side Performance (HIGH)

- `server-auth-actions` - Authenticate server actions like API routes
- `server-cache-react` - Use React.cache() for per-request deduplication
- `server-cache-lru` - Use LRU cache for cross-request caching
- `server-dedup-props` - Avoid duplicate serialization in RSC props
- `server-serialization` - Minimize data passed to client components
- `server-parallel-fetching` - Restructure components to parallelize fetches
- `server-after-nonblocking` - Use after() for non-blocking operations

### 4. Client-Side Data Fetching (MEDIUM-HIGH)

- `client-swr-dedup` - Use SWR for automatic request deduplication
- `client-event-listeners` - Deduplicate global event listeners
- `client-passive-event-listeners` - Use passive listeners for scroll
- `client-localstorage-schema` - Version and minimize localStorage data

### 5. Re-render Optimization (MEDIUM)

- `rerender-defer-reads` - Don''t subscribe to state only used in callbacks
- `rerender-memo` - Extract expensive work into memoized components
- `rerender-memo-with-default-value` - Hoist default non-primitive props
- `rerender-dependencies` - Use primitive dependencies in effects
- `rerender-derived-state` - Subscribe to derived booleans, not raw values
- `rerender-derived-state-no-effect` - Derive state during render, not effects
- `rerender-functional-setstate` - Use functional setState for stable callbacks
- `rerender-lazy-state-init` - Pass function to useState for expensive values
- `rerender-simple-expression-in-memo` - Avoid memo for simple primitives
- `rerender-move-effect-to-event` - Put interaction logic in event handlers
- `rerender-transitions` - Use startTransition for non-urgent updates
- `rerender-use-ref-transient-values` - Use refs for transient frequent values

### 6. Rendering Performance (MEDIUM)

- `rendering-animate-svg-wrapper` - Animate div wrapper, not SVG element
- `rendering-content-visibility` - Use content-visibility for long lists
- `rendering-hoist-jsx` - Extract static JSX outside components
- `rendering-svg-precision` - Reduce SVG coordinate precision
- `rendering-hydration-no-flicker` - Use inline script for client-only data
- `rendering-hydration-suppress-warning` - Suppress expected mismatches
- `rendering-activity` - Use Activity component for show/hide
- `rendering-conditional-render` - Use ternary, not && for conditionals
- `rendering-usetransition-loading` - Prefer useTransition for loading state

### 7. JavaScript Performance (LOW-MEDIUM)

- `js-batch-dom-css` - Group CSS changes via classes or cssText
- `js-index-maps` - Build Map for repeated lookups
- `js-cache-property-access` - Cache object properties in loops
- `js-cache-function-results` - Cache function results in module-level Map
- `js-cache-storage` - Cache localStorage/sessionStorage reads
- `js-combine-iterations` - Combine multiple filter/map into one loop
- `js-length-check-first` - Check array length before expensive comparison
- `js-early-exit` - Return early from functions
- `js-hoist-regexp` - Hoist RegExp creation outside loops
- `js-min-max-loop` - Use loop for min/max instead of sort
- `js-set-map-lookups` - Use Set/Map for O(1) lookups
- `js-tosorted-immutable` - Use toSorted() for immutability

### 8. Advanced Patterns (LOW)

- `advanced-event-handler-refs` - Store event handlers in refs
- `advanced-init-once` - Initialize app once per app load
- `advanced-use-latest` - useLatest for stable callback refs

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/async-parallel.md
rules/bundle-barrel-imports.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
' WHERE slug = 'columbia-cloudworks-llc-react-best-practices';
UPDATE skills SET content = '---
name: vercel-deployment
description: Vercel deployment using Vercel CLI for Next.js, React, Vue, static sites, and serverless functions. Includes project validation, deployment orchestration, environment management, domain configuration, and analytics integration. Use when deploying frontend applications, static sites, or serverless APIs, or when user mentions Vercel, Next.js deployment, serverless functions, or edge network.
allowed-tools: Bash, Read, Write, Edit
---

# Vercel Deployment Skill

This skill provides comprehensive deployment lifecycle management for applications deployed to Vercel using the Vercel CLI.

## Overview

The deployment lifecycle consists of five phases:
1. **Pre-Deployment Validation** - Application readiness, framework detection, build validation
2. **Project Configuration** - vercel.json generation, build settings, environment variables
3. **Deployment** - Deploy to preview or production, manage builds
4. **Domain & Environment Management** - Custom domains, environment variables, aliases
5. **Post-Deployment Verification** - Health checks, deployment status, analytics

## Supported Application Types

- **Next.js**: App Router, Pages Router, API Routes, Middleware
- **React**: Create React App, Vite, custom builds
- **Vue**: Vue 3, Nuxt, Vite
- **Static Sites**: HTML/CSS/JS, Gatsby, Astro, Hugo, Jekyll
- **Serverless Functions**: Node.js, Python, Go, Ruby serverless APIs
- **Monorepos**: Turborepo, Nx, pnpm workspaces

## Available Scripts

### 1. Application Validation

**Script**: `scripts/validate-app.sh <app-path>`

**Purpose**: Validates application is ready for Vercel deployment

**Checks**:
- Framework detection (Next.js, React, Vue, static)
- package.json or build configuration present
- Build command specified or detectable
- Output directory configured
- No hardcoded secrets in code
- Environment configuration present
- Node.js version compatibility

**Usage**:
```bash
# Validate Next.js app
./scripts/validate-app.sh /path/to/nextjs-app

# Validate React app
./scripts/validate-app.sh /path/to/react-app

# Validate static site
STATIC_SITE=true ./scripts/validate-app.sh /path/to/static-site

# Verbose mode
VERBOSE=1 ./scripts/validate-app.sh .
```

**Exit Codes**:
- `0`: Validation passed
- `1`: Validation failed (must fix before deployment)

### 2. Deploy to Vercel

**Script**: `scripts/deploy-to-vercel.sh <app-path> [environment]`

**Purpose**: Deploys application to Vercel

**Actions**:
- Validates Vercel CLI authentication
- Detects project framework and settings
- Links project to Vercel (if first deployment)
- Builds and deploys application
- Configures environment variables
- Captures deployment URL
- Monitors deployment status

**Usage**:
```bash
# Deploy to preview (automatic for branches)
./scripts/deploy-to-vercel.sh /path/to/app

# Deploy to production
./scripts/deploy-to-vercel.sh /path/to/app production

# Deploy with custom name
PROJECT_NAME=my-app ./scripts/deploy-to-vercel.sh /path/to/app

# Deploy and wait for completion
WAIT=true ./scripts/deploy-to-vercel.sh /path/to/app production

# Deploy with specific build command
BUILD_CMD="npm run build:prod" ./scripts/deploy-to-vercel.sh /path/to/app
```

**Environment Variables**:
- `VERCEL_TOKEN`: Vercel authentication token
- `VERCEL_ORG_ID`: Organization ID (for team projects)
- `VERCEL_PROJECT_ID`: Project ID (for existing projects)
- `PROJECT_NAME`: Custom project name
- `BUILD_CMD`: Custom build command
- `OUTPUT_DIR`: Custom output directory
- `WAIT`: Set to `true` to wait for deployment completion
- `PROD`: Set to `true` for production deployment

**Exit Codes**:
- `0`: Deployment successful
- `1`: Deployment failed

### 3. Update Environment Variables

**Script**: `scripts/update-env-vars.sh <project-name> <environment>`

**Purpose**: Updates environment variables for Vercel project

**Actions**:
- Retrieves current environment variables
- Prompts for updated variables
- Supports development, preview, production scopes
- Triggers redeployment if needed
- Verifies variables applied

**Usage**:
```bash
# Update production env vars
./scripts/update-env-vars.sh my-app production

# Update from .env file
ENV_FILE=.env.production ./scripts/update-env-vars.sh my-app production

# Update specific variables
API_KEY=new_key DATABASE_URL=new_url ./scripts/update-env-vars.sh my-app production

# Update for all environments
ENV_SCOPE=all ./scripts/update-env-vars.sh my-app
```

**Exit Codes**:
- `0`: Environment variables updated successfully
- `1`: Update failed

### 4. Configure Domain

**Script**: `scripts/configure-domain.sh <project-name> <domain>`

**Purpose**: Configures custom domain for Vercel project

**Actions**:
- Adds domain to Vercel project
- Configures SSL/TLS certificate (automatic)
- Sets up DNS records
- Configures redirects (www, apex)
- Verifies domain is accessible

**Usage**:
```bash
# Add custom domain
./scripts/configure-domain.sh my-app myapp.com

# Add with www redirect
WWW_REDIRECT=true ./scripts/configure-domain.sh my-app myapp.com

# Add subdomain
./scripts/configure-domain.sh my-app api.myapp.com

# Force HTTPS redirect
FORCE_HTTPS=true ./scripts/configure-domain.sh my-app myapp.com
```

**Exit Codes**:
- `0`: Domain configured successfully
- `1`: Configuration failed

### 5. Manage Deployments

**Script**: `scripts/manage-deployment.sh <action> <project-name>`

**Purpose**: Manage Vercel deployments and project

**Actions**:
- `list`: List recent deployments
- `inspect`: Show deployment details
- `logs`: View deployment logs
- `rollback`: Rollback to previous deployment
- `promote`: Promote preview to production
- `remove`: Remove deployment
- `alias`: Manage aliases

**Usage**:
```bash
# List deployments
./scripts/manage-deployment.sh list my-app

# Inspect specific deployment
./scripts/manage-deployment.sh inspect my-app <deployment-url>

# View logs
./scripts/manage-deployment.sh logs my-app <deployment-url>

# Rollback to previous
./scripts/manage-deployment.sh rollback my-app

# Promote preview to production
./scripts/manage-deployment.sh promote my-app <preview-url>

# Remove deployment
./scripts/manage-deployment.sh remove my-app <deployment-url>
```

### 6. Health Check

**Script**: `scripts/health-check.sh <deployment-url>`

**Purpose**: Validates Vercel deployment health

**Checks**:
- Deployment status (ready/building/error)
- HTTP endpoint accessibility
- SSL certificate validity
- Build logs for errors
- Performance metrics
- Edge network propagation
- DNS resolution

**Usage**:
```bash
# Check deployment health
./scripts/health-check.sh https://my-app.vercel.app

# Continuous monitoring (runs every 30s)
MONITOR=true ./scripts/health-check.sh https://my-app.vercel.app

# Detailed health report
DETAILED=true ./scripts/health-check.sh https://my-app.vercel.app
```

**Exit Codes**:
- `0`: All health checks passed
- `1`: One or more health checks failed

### 7. Project Setup

**Script**: `scripts/setup-project.sh <app-path> <project-name>`

**Purpose**: Initialize Vercel project configuration

**Actions**:
- Creates vercel.json configuration
- Links project to Vercel
- Sets up environment variables
- Configures build settings
- Sets up Git integration

**Usage**:
```bash
# Setup new project
./scripts/setup-project.sh /path/to/app my-app

# Setup with custom settings
FRAMEWORK=nextjs ./scripts/setup-project.sh /path/to/app my-app

# Setup for team
TEAM=my-team ./scripts/setup-project.sh /path/to/app my-app
```

## Available Templates

### 1. Next.js Configuration

**File**: `templates/vercel-nextjs.json`

**Purpose**: vercel.json for Next.js applications

**Example**:
```json
{
  "version": 2,
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "devCommand": "npm run dev",
  "env": {
    "NEXT_PUBLIC_API_URL": "your_api_url_here"
  },
  "build": {
    "env": {
      "DATABASE_URL": "@database-url"
    }
  }
}
```

### 2. React/Vite Configuration

**File**: `templates/vercel-react.json`

**Purpose**: vercel.json for React applications

**Example**:
```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "devCommand": "npm run dev",
  "framework": "vite",
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

### 3. Static Site Configuration

**File**: `templates/vercel-static.json`

**Purpose**: vercel.json for static sites

**Example**:
```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "public",
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

### 4. Serverless Functions Configuration

**File**: `templates/vercel-serverless.json`

**Purpose**: vercel.json for serverless API

**Example**:
```json
{
  "version": 2,
  "functions": {
    "api/**/*.js": {
      "runtime": "nodejs18.x",
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/$1"
    }
  ]
}
```

### 5. Environment Variables Template

**File**: `templates/.env.example`

**Purpose**: Environment variable template

**Example**:
```bash
# Public variables (exposed to browser)
NEXT_PUBLIC_API_URL=your_api_url_here
NEXT_PUBLIC_ANALYTICS_ID=your_analytics_id_here

# Server-only variables (not exposed)
DATABASE_URL=your_database_url_here
API_SECRET=your_api_secret_here
STRIPE_SECRET_KEY=your_stripe_key_here

# Vercel system variables (automatically provided)
# VERCEL=1
# VERCEL_URL=<deployment-url>
# VERCEL_ENV=production|preview|development
```

## Deployment Workflow

### Initial Deployment

1. **Validate Application**:
   ```bash
   ./scripts/validate-app.sh /path/to/app
   ```

2. **Setup Project**:
   ```bash
   ./scripts/setup-project.sh /path/to/app my-app
   ```

3. **Deploy to Preview**:
   ```bash
   ./scripts/deploy-to-vercel.sh /path/to/app
   ```

4. **Verify Deployment**:
   ```bash
   ./scripts/health-check.sh https://my-app-preview.vercel.app
   ```

5. **Deploy to Production**:
   ```bash
   ./scripts/deploy-to-vercel.sh /path/to/app production
   ```

### Update Deployment

1. **Deploy Updates**:
   ```bash
   ./scripts/deploy-to-vercel.sh /path/to/app production
   ```

2. **Verify Health**:
   ```bash
   ./scripts/health-check.sh https://my-app.com
   ```

### Update Environment Variables

1. **Update Variables**:
   ```bash
   ./scripts/update-env-vars.sh my-app production
   ```

2. **Redeploy** (automatic after env var changes)

### Configure Custom Domain

1. **Add Domain**:
   ```bash
   ./scripts/configure-domain.sh my-app myapp.com
   ```

2. **Update DNS** (follow Vercel instructions)

3. **Verify Domain**:
   ```bash
   ./scripts/health-check.sh https://myapp.com
   ```

## Security Best Practices

1. **Never Hardcode Secrets**: Always use environment variables
2. **Use Vercel Secrets**: Encrypt sensitive values with `vercel secrets add`
3. **Scope Variables**: Use appropriate target (development, preview, production)
4. **Prefix Public Variables**: Use `NEXT_PUBLIC_` for browser-exposed variables
5. **Rotate Secrets**: Regularly update API keys and tokens
6. **Enable Protection**: Use Vercel''s deployment protection features
7. **Monitor Logs**: Regularly check deployment and runtime logs
8. **Use Teams**: Manage access with Vercel teams for collaboration

## Framework-Specific Features

### Next.js
- **App Router**: Full support for Next.js 13+ App Router
- **API Routes**: Serverless API endpoints
- **Middleware**: Edge middleware support
- **ISR**: Incremental Static Regeneration
- **Image Optimization**: Automatic image optimization
- **Font Optimization**: Automatic font optimization

### React/Vite
- **SPA Mode**: Single Page Application routing
- **API Proxying**: Proxy API requests to avoid CORS
- **Code Splitting**: Automatic code splitting
- **Fast Refresh**: Hot module replacement

### Static Sites
- **CDN**: Global edge network
- **Asset Optimization**: Automatic compression
- **Headers**: Custom header configuration
- **Redirects**: URL redirect management

### Serverless Functions
- **Edge Functions**: Ultra-low latency edge runtime
- **Node.js**: Full Node.js runtime support
- **Python**: Python serverless functions
- **Go**: Go serverless functions

## Vercel vs Other Platforms

| Feature | Vercel | App Platform | Droplets |
|---------|--------|--------------|----------|
| **Framework Focus** | Frontend/Fullstack | Any | Any |
| **Edge Network** | Global | CDN available | Manual |
| **Serverless** | Built-in | No | Manual |
| **Git Integration** | Native | Native | Manual |
| **Build Time** | Fast | Medium | N/A |
| **Cost (Small)** | Free-$20/mo | $5-12/mo | $4-6/mo |
| **Best For** | Next.js, React, Vue | Docker apps | Custom servers |

## Troubleshooting

### Build Failures

```bash
# View build logs
./scripts/manage-deployment.sh logs my-app <deployment-url>

# Common issues:
# - Missing dependencies in package.json
# - Incorrect build command
# - Node.js version mismatch
# - Environment variables missing at build time
```

### Deployment Failures

```bash
# Check deployment status
vercel inspect <deployment-url>

# View runtime logs
vercel logs <deployment-url>

# Common issues:
# - Serverless function timeout
# - Memory limit exceeded
# - Missing environment variables
# - API route errors
```

### Domain Issues

```bash
# Check domain configuration
vercel domains ls

# Verify DNS
dig myapp.com

# Common issues:
# - DNS not propagated (wait 24-48 hours)
# - Incorrect DNS records
# - SSL certificate provisioning (automatic, wait a few minutes)
```

## Cost Optimization

### Free Tier
- **Hobby Plan**: Free forever
- **Bandwidth**: 100GB/month
- **Build Time**: 100 hours/month
- **Serverless Executions**: 100GB-hours
- **Edge Requests**: Unlimited

### Pro Tier ($20/month)
- **Bandwidth**: 1TB/month
- **Build Time**: Unlimited
- **Team Collaboration**: Yes
- **Password Protection**: Yes
- **Analytics**: Advanced

### Tips
- Use ISR to reduce build times
- Optimize images with Next.js Image
- Cache static assets
- Use Edge Functions for low latency

## Integration with Dev Lifecycle

This skill integrates with:
- `/deployment:prepare` - Pre-deployment validation
- `/deployment:deploy` - Execute Vercel deployment
- `/deployment:validate` - Post-deployment verification
- `/deployment:rollback` - Rollback to previous deployment

## Vercel CLI Commands Reference

```bash
# Authentication
vercel login
vercel logout

# Deployment
vercel                    # Deploy to preview
vercel --prod            # Deploy to production
vercel --name my-app     # Deploy with custom name

# Project Management
vercel list           

<!-- truncated -->' WHERE slug = 'vanman2024-vercel-deployment';
UPDATE skills SET content = '---
name: web-artifacts-builder
description: Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui). Use for complex artifacts requiring state management, routing, or shadcn/ui components - not for simple single-file HTML/JSX artifacts.
license: Complete terms in LICENSE.txt
---

## Description

Skill description.

# Web Artifacts Builder

To build powerful frontend claude.ai artifacts, follow these steps:
1. Initialize the frontend repo using `scripts/init-artifact.sh`
2. Develop your artifact by editing the generated code
3. Bundle all code into a single HTML file using `scripts/bundle-artifact.sh`
4. Display artifact to user
5. (Optional) Test the artifact

**Stack**: React 18 + TypeScript + Vite + Parcel (bundling) + Tailwind CSS + shadcn/ui

## Design & Style Guidelines

VERY IMPORTANT: To avoid what is often referred to as "AI slop", avoid using excessive centered layouts, purple gradients, uniform rounded corners, and Inter font.

## Quick Start

### Step 1: Initialize Project

Run the initialization script to create a new React project:
```bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

This creates a fully configured project with:
- ✅ React + TypeScript (via Vite)
- ✅ Tailwind CSS 3.4.1 with shadcn/ui theming system
- ✅ Path aliases (`@/`) configured
- ✅ 40+ shadcn/ui components pre-installed
- ✅ All Radix UI dependencies included
- ✅ Parcel configured for bundling (via .parcelrc)
- ✅ Node 18+ compatibility (auto-detects and pins Vite version)

### Step 2: Develop Your Artifact

To build the artifact, edit the generated files. See **Common Development Tasks** below for guidance.

### Step 3: Bundle to Single HTML File

To bundle the React app into a single HTML artifact:
```bash
bash scripts/bundle-artifact.sh
```

This creates `bundle.html` - a self-contained artifact with all JavaScript, CSS, and dependencies inlined. This file can be directly shared in Claude conversations as an artifact.

**Requirements**: Your project must have an `index.html` in the root directory.

**What the script does**:
- Installs bundling dependencies (parcel, @parcel/config-default, parcel-resolver-tspaths, html-inline)
- Creates `.parcelrc` config with path alias support
- Builds with Parcel (no source maps)
- Inlines all assets into single HTML using html-inline

### Step 4: Share Artifact with User

Finally, share the bundled HTML file in conversation with the user so they can view it as an artifact.

### Step 5: Testing/Visualizing the Artifact (Optional)

Note: This is a completely optional step. Only perform if necessary or requested.

To test/visualize the artifact, use available tools (including other Skills or built-in tools like Playwright or Puppeteer). In general, avoid testing the artifact upfront as it adds latency between the request and when the finished artifact can be seen. Test later, after presenting the artifact, if requested or if issues arise.

## Reference

- **shadcn/ui components**: https://ui.shadcn.com/docs/components' WHERE slug = 'billlzzz18-web-artifacts-builder';
UPDATE skills SET content = '---
name: React Integration
description: This skill should be used when the user asks to "connect React to agent runtime", "use useAgentSession", "use useMessages", "set up AgentServiceProvider", "stream agent responses", "build agent chat UI", "render conversation blocks", or needs to build a React frontend with @hhopkins/agent-runtime-react.
---

# React Integration

## Overview

The `@hhopkins/agent-runtime-react` package provides React hooks and context for connecting to the agent runtime backend. It handles:
- WebSocket connection management
- Session lifecycle
- Real-time streaming updates
- State management via Context + Reducer

## Installation

```bash
pnpm add @hhopkins/agent-runtime-react
```

## Provider Setup

Wrap the application with `AgentServiceProvider`:

```tsx
import { AgentServiceProvider } from "@hhopkins/agent-runtime-react";

function App() {
  return (
    <AgentServiceProvider
      apiUrl="http://localhost:3001"      // REST API URL
      wsUrl="http://localhost:3001"       // WebSocket URL (same server)
      apiKey="your-api-key"               // API key for auth
      debug={false}                       // Enable debug logging
    >
      <YourApp />
    </AgentServiceProvider>
  );
}
```

The provider:
- Initializes REST client and WebSocket manager
- Connects WebSocket immediately
- Loads initial session list
- Sets up event listeners for all WebSocket events

## Hooks

### useAgentSession

Manage session lifecycle - create, load, destroy sessions:

```tsx
import { useAgentSession } from "@hhopkins/agent-runtime-react";

function SessionManager() {
  const {
    session,           // Current session state (null if not loaded)
    runtime,           // Runtime state (sandbox status)
    isLoading,         // Operation in progress
    error,             // Last error
    createSession,     // Create new session
    loadSession,       // Load existing session
    destroySession,    // Destroy current session
    syncSession,       // Manually sync to persistence
    updateSessionOptions,  // Update session options
  } = useAgentSession(sessionId);  // Optional: auto-load on mount

  // Create a new session
  const handleCreate = async () => {
    const newSessionId = await createSession(
      "agent-profile-id",     // Agent profile reference
      "claude-agent-sdk",     // Architecture type
      { model: "sonnet" }     // Optional session options
    );
  };

  return (
    <div>
      <p>Sandbox: {runtime?.sandbox.status}</p>
      <button onClick={handleCreate}>New Session</button>
    </div>
  );
}
```

**Important:** Call `useAgentSession` at the page/container level to ensure WebSocket room is joined regardless of which child components render.

### useMessages

Access conversation blocks and send messages:

```tsx
import { useMessages } from "@hhopkins/agent-runtime-react";

function Chat({ sessionId }: { sessionId: string }) {
  const {
    blocks,              // ConversationBlock[] - pre-merged with streaming
    streamingBlockIds,   // Set<string> - IDs currently streaming
    isStreaming,         // boolean - any block streaming
    metadata,            // Token/cost info
    error,               // Last error
    sendMessage,         // Send message to agent
    getBlock,            // Get block by ID
    getBlocksByType,     // Filter blocks by type
  } = useMessages(sessionId);

  const handleSend = async (text: string) => {
    await sendMessage(text);
    // Response arrives via WebSocket events
  };

  return (
    <div>
      {blocks.map((block) => (
        <BlockRenderer
          key={block.id}
          block={block}
          isStreaming={streamingBlockIds.has(block.id)}
        />
      ))}
      <MessageInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
```

**Streaming behavior:** Blocks are pre-merged with streaming content. A temporary block with ID `"streaming"` appears during active streaming.

### useSessionList

List all sessions:

```tsx
import { useSessionList } from "@hhopkins/agent-runtime-react";

function SessionList({ onSelect }: { onSelect: (id: string) => void }) {
  const { sessions, isLoading, error, refresh } = useSessionList();

  return (
    <ul>
      {sessions.map((session) => (
        <li key={session.sessionId} onClick={() => onSelect(session.sessionId)}>
          {session.sessionId} - {session.type}
        </li>
      ))}
    </ul>
  );
}
```

### useWorkspaceFiles

Track files modified by the agent:

```tsx
import { useWorkspaceFiles } from "@hhopkins/agent-runtime-react";

function FileExplorer({ sessionId }: { sessionId: string }) {
  const { files, getFile } = useWorkspaceFiles(sessionId);

  return (
    <ul>
      {files.map((file) => (
        <li key={file.path}>
          {file.path}
          <pre>{file.content}</pre>
        </li>
      ))}
    </ul>
  );
}
```

### useSubagents

Track subagent transcripts:

```tsx
import { useSubagents } from "@hhopkins/agent-runtime-react";

function SubagentViewer({ sessionId }: { sessionId: string }) {
  const { subagents, getSubagent } = useSubagents(sessionId);

  return (
    <div>
      {subagents.map((subagent) => (
        <div key={subagent.id}>
          <h4>{subagent.name}</h4>
          <p>Status: {subagent.status}</p>
        </div>
      ))}
    </div>
  );
}
```

### useEvents

Access debug event log for monitoring WebSocket events:

```tsx
import { useEvents } from "@hhopkins/agent-runtime-react";

function DebugPanel() {
  const { events, clearEvents } = useEvents();

  return (
    <div>
      <button onClick={clearEvents}>Clear</button>
      {events.map((event, i) => (
        <pre key={i}>{JSON.stringify(event, null, 2)}</pre>
      ))}
    </div>
  );
}
```

## Rendering Blocks

Handle different block types when rendering:

```tsx
function BlockRenderer({ block, isStreaming }) {
  switch (block.type) {
    case "user_message":
      return <UserMessage content={block.content} />;

    case "assistant_text":
      return (
        <AssistantMessage
          content={block.content}
          isStreaming={isStreaming}
        />
      );

    case "tool_use":
      return (
        <ToolCall
          name={block.toolName}
          input={block.input}
        />
      );

    case "tool_result":
      return (
        <ToolResult
          content={block.content}
          isError={block.isError}
        />
      );

    case "thinking":
      return <ThinkingBlock content={block.content} />;

    case "subagent":
      return (
        <SubagentCall
          name={block.name}
          status={block.status}
        />
      );

    case "error":
      return <ErrorMessage message={block.message} />;

    default:
      return null;
  }
}
```

## Streaming Patterns

### Show typing indicator

```tsx
function Chat({ sessionId }) {
  const { blocks, isStreaming } = useMessages(sessionId);

  return (
    <div>
      {blocks.map((block) => <BlockRenderer key={block.id} block={block} />)}
      {isStreaming && <TypingIndicator />}
    </div>
  );
}
```

### Animated text streaming

```tsx
function AssistantMessage({ content, isStreaming }) {
  return (
    <div className={isStreaming ? "streaming" : ""}>
      {content}
      {isStreaming && <span className="cursor">|</span>}
    </div>
  );
}
```

### Optimistic updates

User messages appear immediately via optimistic updates. The hook dispatches `OPTIMISTIC_USER_MESSAGE`, then replaces it with the real message when `block_complete` arrives.

## Error Handling

Errors are surfaced in multiple ways:

```tsx
function Chat({ sessionId }) {
  const { error: sessionError } = useAgentSession(sessionId);
  const { error: messageError, blocks } = useMessages(sessionId);

  // Check hook-level errors
  if (sessionError) return <Error message={sessionError.message} />;

  // ErrorBlocks appear inline in the conversation
  const errorBlocks = blocks.filter((b) => b.type === "error");

  return <div>...</div>;
}
```

## Related Skills

- **overview** - Understanding the runtime architecture
- **backend-setup** - Setting up the backend server
- **agent-design** - Configuring agent profiles
' WHERE slug = 'hhopkins95-react-integration';
UPDATE skills SET content = '---
name: shadcn
description: Comprehensive shadcn/ui component library with theming, customization patterns, and accessibility. Use when building modern React UIs with Tailwind CSS. IMPORTANT - Always use MCP server tools first when available.
---

# shadcn/ui Skill

Beautiful, accessible components built with Radix UI and Tailwind CSS. Copy and paste into your apps.

## MCP Server Integration (PRIORITY)

**ALWAYS check and use MCP server tools first:**

```
# 1. Check availability
mcp__shadcn__get_project_registries

# 2. Search components
mcp__shadcn__search_items_in_registries
  registries: ["@shadcn"]
  query: "button"

# 3. Get examples
mcp__shadcn__get_item_examples_from_registries
  registries: ["@shadcn"]
  query: "button-demo"

# 4. Get install command
mcp__shadcn__get_add_command_for_items
  items: ["@shadcn/button"]

# 5. Verify implementation
mcp__shadcn__get_audit_checklist
```

## Quick Start

### Installation

```bash
# Initialize shadcn in your project
npx shadcn@latest init

# Add components
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
```

### Project Structure

```
src/
├── components/
│   └── ui/           # shadcn components
│       ├── button.tsx
│       ├── card.tsx
│       └── input.tsx
├── lib/
│   └── utils.ts      # cn() utility
└── app/
    └── globals.css   # CSS variables
```

## Key Concepts

| Concept | Guide |
|---------|-------|
| **Theming** | [reference/theming.md](reference/theming.md) |
| **Accessibility** | [reference/accessibility.md](reference/accessibility.md) |
| **Animations** | [reference/animations.md](reference/animations.md) |
| **Components** | [reference/components.md](reference/components.md) |

## Examples

| Pattern | Guide |
|---------|-------|
| **Form Patterns** | [examples/form-patterns.md](examples/form-patterns.md) |
| **Data Display** | [examples/data-display.md](examples/data-display.md) |
| **Navigation** | [examples/navigation.md](examples/navigation.md) |
| **Feedback** | [examples/feedback.md](examples/feedback.md) |

## Templates

| Template | Purpose |
|----------|---------|
| [templates/theme-config.ts](templates/theme-config.ts) | Tailwind theme extension |
| [templates/component-scaffold.tsx](templates/component-scaffold.tsx) | Base component with variants |
| [templates/form-template.tsx](templates/form-template.tsx) | Form with validation |

## Component Categories

### Inputs
- Button, Input, Textarea, Select, Checkbox, Radio, Switch, Slider

### Data Display
- Card, Table, Avatar, Badge, Calendar

### Feedback
- Alert, Toast, Dialog, Sheet, Tooltip, Popover

### Navigation
- Tabs, Navigation Menu, Breadcrumb, Pagination

### Layout
- Accordion, Collapsible, Separator, Scroll Area

## Theming System

### CSS Variables

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... */
  }
}
```

### Dark Mode Toggle

```tsx
"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
```

## Utility Function

```typescript
// lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Common Patterns

### Form with Validation

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function LoginForm() {
  const form = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
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
  );
}
```

### Toast Notifications

```tsx
import { toast } from "sonner";

// Success
toast.success("Task created successfully");

// Error
toast.error("Something went wrong");

// With action
toast("Event created", {
  action: {
    label: "Undo",
    onClick: () => console.log("Undo"),
  },
});
```

## Accessibility Checklist

- [ ] All interactive elements are keyboard accessible
- [ ] Focus states are visible
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] ARIA labels on icon-only buttons
- [ ] Form inputs have associated labels
- [ ] Error messages are announced to screen readers
- [ ] Dialogs trap focus and return focus on close
- [ ] Reduced motion preferences respected
' WHERE slug = 'naimalarain13-shadcn';
UPDATE skills SET content = '---
name: fetching-library-docs
description: |
  Token-efficient library API documentation fetcher using Context7 MCP with 77% token savings.
  Fetches code examples, API references, and usage patterns for published libraries (React,
  Next.js, Prisma, etc). Use when users ask "how do I use X library", need code examples,
  want API syntax, or are learning a framework''s official API. Triggers: "Show me React hooks",
  "Prisma query syntax", "Next.js routing API". NOT for exploring repo internals/source code
  (use researching-with-deepwiki) or local files.
---

# Context7 Efficient Documentation Fetcher

Fetch library documentation with automatic 77% token reduction via shell pipeline.

## Quick Start

**Always use the token-efficient shell pipeline:**

```bash
# Automatic library resolution + filtering
bash scripts/fetch-docs.sh --library <library-name> --topic <topic>

# Examples:
bash scripts/fetch-docs.sh --library react --topic useState
bash scripts/fetch-docs.sh --library nextjs --topic routing
bash scripts/fetch-docs.sh --library prisma --topic queries
```

**Result:** Returns ~205 tokens instead of ~934 tokens (77% savings).

## Standard Workflow

For any documentation request, follow this workflow:

### 1. Identify Library and Topic

Extract from user query:
- **Library:** React, Next.js, Prisma, Express, etc.
- **Topic:** Specific feature (hooks, routing, queries, etc.)

### 2. Fetch with Shell Pipeline

```bash
bash scripts/fetch-docs.sh --library <library> --topic <topic> --verbose
```

The `--verbose` flag shows token savings statistics.

### 3. Use Filtered Output

The script automatically:
- Fetches full documentation (934 tokens, stays in subprocess)
- Filters to code examples + API signatures + key notes
- Returns only essential content (205 tokens to Claude)

## Parameters

### Basic Usage

```bash
bash scripts/fetch-docs.sh [OPTIONS]
```

**Required (pick one):**
- `--library <name>` - Library name (e.g., "react", "nextjs")
- `--library-id <id>` - Direct Context7 ID (faster, skips resolution)

**Optional:**
- `--topic <topic>` - Specific feature to focus on
- `--mode <code|info>` - code for examples (default), info for concepts
- `--page <1-10>` - Pagination for more results
- `--verbose` - Show token savings statistics

### Mode Selection

**Code Mode (default):** Returns code examples + API signatures
```bash
--mode code
```

**Info Mode:** Returns conceptual explanations + fewer examples
```bash
--mode info
```

## Common Library IDs

Use `--library-id` for faster lookup (skips resolution):

```bash
React:      /reactjs/react.dev
Next.js:    /vercel/next.js
Express:    /expressjs/express
Prisma:     /prisma/docs
MongoDB:    /mongodb/docs
Fastify:    /fastify/fastify
NestJS:     /nestjs/docs
Vue.js:     /vuejs/docs
Svelte:     /sveltejs/site
```

## Workflow Patterns

### Pattern 1: Quick Code Examples

User asks: "Show me React useState examples"

```bash
bash scripts/fetch-docs.sh --library react --topic useState --verbose
```

Returns: 5 code examples + API signatures + notes (~205 tokens)

### Pattern 2: Learning New Library

User asks: "How do I get started with Prisma?"

```bash
# Step 1: Get overview
bash scripts/fetch-docs.sh --library prisma --topic "getting started" --mode info

# Step 2: Get code examples
bash scripts/fetch-docs.sh --library prisma --topic queries --mode code
```

### Pattern 3: Specific Feature Lookup

User asks: "How does Next.js routing work?"

```bash
bash scripts/fetch-docs.sh --library-id /vercel/next.js --topic routing
```

Using `--library-id` is faster when you know the exact ID.

### Pattern 4: Deep Exploration

User needs comprehensive information:

```bash
# Page 1: Basic examples
bash scripts/fetch-docs.sh --library react --topic hooks --page 1

# Page 2: Advanced patterns
bash scripts/fetch-docs.sh --library react --topic hooks --page 2
```

## Token Efficiency

**How it works:**

1. `fetch-docs.sh` calls `fetch-raw.sh` (which uses `mcp-client.py`)
2. Full response (934 tokens) stays in subprocess memory
3. Shell filters (awk/grep/sed) extract essentials (0 LLM tokens used)
4. Returns filtered output (205 tokens) to Claude

**Savings:**
- Direct MCP: 934 tokens per query
- This approach: 205 tokens per query
- **77% reduction**

**Do NOT use `mcp-client.py` directly** - it bypasses filtering and wastes tokens.

## Advanced: Library Resolution

If library name fails, try variations:

```bash
# Try different formats
--library "next.js"    # with dot
--library "nextjs"     # without dot
--library "next"       # short form

# Or search manually
bash scripts/fetch-docs.sh --library "your-library" --verbose
# Check output for suggested library IDs
```

## Verification

Run: `python3 scripts/verify.py`

Expected: `✓ fetch-docs.sh ready`

## If Verification Fails

1. Run diagnostic: `ls -la scripts/fetch-docs.sh`
2. Check: Script exists and is executable
3. Fix: `chmod +x scripts/fetch-docs.sh`
4. **Stop and report** if still failing - do not proceed with downstream steps

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Library not found | Try name variations or use broader search term |
| No results | Use `--mode info` or broader topic |
| Need more examples | Increase page: `--page 2` |
| Want full context | Use `--mode info` for explanations |
| Permission denied | Run: `chmod +x scripts/*.sh` |

## References

For detailed Context7 MCP tool documentation, see:
- [references/context7-tools.md](references/context7-tools.md) - Complete tool reference

## Implementation Notes

**Components (for reference only, use fetch-docs.sh):**
- `mcp-client.py` - Universal MCP client (foundation)
- `fetch-raw.sh` - MCP wrapper
- `extract-code-blocks.sh` - Code example filter (awk)
- `extract-signatures.sh` - API signature filter (awk)
- `extract-notes.sh` - Important notes filter (grep)
- `fetch-docs.sh` - **Main orchestrator (ALWAYS USE THIS)**

**Architecture:**
Shell pipeline processes documentation in subprocess, keeping full response out of Claude''s context. Only filtered essentials enter the LLM context, achieving 77% token savings with 100% functionality preserved.

Based on [Anthropic''s "Code Execution with MCP" blog post](https://www.anthropic.com/engineering/code-execution-with-mcp).
' WHERE slug = 'abdullahmalik17-fetching-library-docs';
UPDATE skills SET content = '---
name: frontend-patterns
description: Frontend development patterns for iMery (React 19, Tailwind CSS, Framer Motion).
---

# iMery Frontend Development Patterns

## Routing: activeView Pattern

iMery uses a state-based routing system instead of a traditional router.

```javascript
// App.jsx
const [activeView, setActiveView] = useState("home");

// Navigation
<button onClick={() => setActiveView("works")}>Go to Works</button>;

// View Rendering
{
  activeView === "home" && <HomeView />;
}
{
  activeView === "works" && <WorksView />;
}
```

## Styling: Tailwind CSS & Premium Design

iMery follows a premium, glassmorphism-inspired design system.

### Glassmorphism Card

```html
<div
  className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 shadow-xl"
>
  <h2 className="text-white text-xl font-semibold">Premium Card</h2>
</div>
```

### Gradients & Icons

Use soft gradients and Lucide icons for a modern feel.

```javascript
import { Heart } from "lucide-react";

<div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-full">
  <Heart className="text-white w-6 h-6" />
</div>;
```

## Animation: Framer Motion

ALWAYS use Framer Motion for view transitions and interactions.

```javascript
import { motion } from "framer-motion";

const PageTransition = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
  >
    {children}
  </motion.div>
);
```

## State Management

### Persistence with useLocalStorage

Use the custom `useLocalStorage` hook for user state and settings.

```javascript
const [user, setUser] = useLocalStorage("imery-user", null);
```

### Data Fetching

Use `useEffect` for fetching data on mount, ideally wrapped in the `api` client.

```javascript
useEffect(() => {
  const loadWorks = async () => {
    const data = await api.getPosts();
    setWorks(data);
  };
  loadWorks();
}, []);
```

## Component Organization

- **Pages**: `src/pages/` (Full screen views)
- **Features**: `src/features/` (Complex logic components like `UploadModal`)
- **Widgets**: `src/widgets/` (Reusable layout elements like `BottomNav`)
- **Shared**: `src/shared/ui/` (Atomic UI components)
' WHERE slug = 'oldcast1e-frontend-patterns';
UPDATE skills SET content = '---
name: Frontend Code Review (React 19)
description: Review React/TS code for UI logic, Tailwind patterns, and render performance.
version: 1.1.0
tools:
  - name: scan_components
    description: "Scans for bundle size, re-render risks, and anti-patterns."
    executable: "python3 scripts/ts_scanner.py"
---

# SYSTEM ROLE
You are a Lead Frontend Engineer. You are reviewing **React 19 / Vite / Tailwind**.
Your goal is to ensure the UI is snappy, type-safe, and maintainable.

# REVIEW GUIDELINES

## 1. Render Performance (React 19)
- **Server Actions:** For data mutation, prefer Server Actions over client-side `useEffect`.
- **Suspense Boundaries:** Ensure data-fetching components are wrapped in `<Suspense>` skeletons rather than using `if (isLoading) return <Spinner />`.
- **Bundle Bloat:** Flag imports of massive libraries (e.g., `moment.js`, full `lodash`) where a smaller alternative or native JS works.

## 2. Component Architecture
- **Prop Drilling:** If props are passed down >3 levels, suggest Composition or Context.
- **Tailwind Efficiency:** Flag "tag soup" (lists of 20+ classes). Suggest extracting to a Shadcn variant or a distinct component.

## 3. Output Format
| Category | Severity | File | Issue | Suggestion |
| :--- | :--- | :--- | :--- | :--- |
| **Perf** | **High** | `Chart.tsx` | Large library import | Lazy load this component. |
| **Style** | **Nitpick** | `Button.tsx` | Inconsistent padding | Use `px-4 py-2` (standard). |

# INSTRUCTION
1. Run `scan_components`.
2. Review code for React Lifecycle and Performance.
3. Output the table to mop_validation\reports\frontend_review.md' WHERE slug = 'bambibanners-frontend-code-review-react-19';
UPDATE skills SET content = '---
name: check-third-party-docs
description: "Esta skill debe usarse cuando el usuario pide \"investiga documentación de\", \"consulta documentación de\", \"quiero integrar X en\", \"cómo integrar\", \"implementar X en proyecto\", \"qué librería para\", \"instalar\", \"configurar\", \"error con\", o menciona agregar funcionalidad que requiere dependencias especializadas (validación con zod, procesamiento imágenes con sharp, colas con bull, caché con ioredis, formularios con react-hook-form). IMPORTANTE: Invocar esta skill en lugar de usar Context7 MCP directamente - la skill proporciona framework de decisión sobre cuándo usar Context7 vs dependency-docs-collector agent según complejidad."
model: claude-haiku-4-5-20251001
version: 0.1.0
user-invocable: true
---

# Third-Party Package Documentation Workflow

Provides decision framework for accessing documentation on specialized third-party packages using Context7 MCP tools and dependency-docs-collector agent.

## Decision Framework

### Use Context7 MCP Directly

For **quick, focused lookups** on specialized packages when you already know what to ask:

**Scenarios:**

- API syntax verification during coding
  - "Verify `zod.object()` schema syntax"
  - "Check `sharp.resize()` options"
- Single method/function lookup
  - "What are `bull` queue retry options?"
  - "How to use `react-hook-form` controller?"
- Specific "how to" for known package
  - "How to validate nested objects with `yup`?"
  - "How to pipeline commands in `ioredis`?"

**Usage:**

```typescript
// 1. Resolve package to Context7 library ID
resolve-library-id("zod", "validate nested objects with zod")

// 2. Query specific documentation
query-docs("/colinhacks/zod", "How to validate nested objects with zod schemas")
```

**When Context7 fails:**

- Package not in Context7 index → Fall back to dependency-docs-collector agent
- After 3 failed resolve attempts → Use agent for web documentation search
- Outdated version docs → Agent can fetch latest version-specific docs

### Use dependency-docs-collector Agent

For **comprehensive documentation gathering** when you need implementation guidance:

**Scenarios:**

#### 1. Adding New Library for Feature

User wants to implement a feature requiring a new dependency:

```
User: "I need to add background job processing to my Express API"
→ Agent: Research job queue libraries (bull, agenda, bee-queue)
→ Gather installation, Redis setup, queue configuration, worker patterns
→ Provide implementation plan with chosen library

User: "Add PDF generation to my Next.js app"
→ Agent: Fetch pdfkit/puppeteer docs
→ Installation, API usage, Next.js integration patterns
→ Example implementation with serverless considerations
```

#### 2. Migrating Between Libraries

User wants to replace existing library with alternative:

```
User: "Migrate from joi to zod for validation"
→ Agent: Gather migration guide, breaking changes
→ Pattern conversions (joi schemas → zod schemas)
→ API differences, TypeScript integration improvements
→ Step-by-step migration plan

User: "Switch from moment to date-fns"
→ Agent: Migration documentation, bundle size comparison
→ Method mapping (moment.format() → date-fns format())
→ Timezone handling differences
```

#### 3. Finding Alternative to Existing Library

User needs replacement due to deprecation, performance, or features:

```
User: "Need alternative to deprecated request library"
→ Agent: Research modern alternatives (axios, got, node-fetch)
→ Feature comparison, API differences
→ Migration guide for chosen alternative

User: "Looking for lighter alternative to lodash"
→ Agent: Evaluate alternatives (just-*, native JS methods)
→ Bundle size analysis, feature parity check
→ Migration recommendations
```

#### 4. Troubleshooting Package Errors

User encounters errors with specialized dependencies:

```
User: "Getting ''ZodError: Invalid input'' with zod validation"
→ Agent: Fetch zod error handling docs
→ Common validation error patterns
→ Debugging techniques, schema refinement

User: "Sharp image processing throwing ''unsupported image format''"
→ Agent: Gather sharp supported formats, installation issues
→ libvips troubleshooting, platform-specific fixes
```

#### 5. Complex Multi-Package Setup

User needs to configure multiple related packages:

```
User: "Set up authentication with next-auth, prisma, and zod"
→ Agent: Gather docs for all three packages
→ Integration patterns, adapter configuration
→ Schema validation with auth flows
→ Complete setup guide

User: "Configure testing with Jest, React Testing Library, MSW"
→ Agent: Fetch setup docs for each package
→ Integration configuration, common patterns
→ Example test suite structure
```

**Agent Invocation:**

```typescript
Task({
  subagent_type: "dotclaudefiles:dependency-docs-collector",
  prompt: `
    User wants to [add library X for Y feature / migrate from A to B / find alternative to C].
    Context: [language, framework, specific problem]
    Error (if troubleshooting): [error message]

    Gather documentation, provide implementation/migration plan.
  `
})
```

## Context7 + Troubleshooting Workflow

When troubleshooting with Context7:

1. **Error analysis**: Identify package causing error
2. **Quick lookup**: Use Context7 for error message/API verification
3. **If Context7 insufficient**: Escalate to agent for comprehensive debugging

**Example:**

```
User: "Getting error: ''Queue job failed with status 500'' in bull"

Step 1: Quick Context7 lookup
→ query-docs("bull", "job failure handling error status codes")
→ Find basic error handling patterns

Step 2: If error persists or needs deeper investigation
→ Escalate to dependency-docs-collector agent
→ Agent gathers: error handling docs, retry strategies, logging patterns
→ Provides comprehensive debugging guide
```

## Critical Constraints

### NEVER Use Context7 for Standard Libraries

Context7 is **only** for third-party packages:

❌ **Do NOT use:**

- Language standard libraries: `fmt.Println` (Go), `Array.map` (JS), `os.ReadFile` (Go)
- Built-in features: `Promise`, `async/await`, Python list comprehensions
- Platform APIs: `document.querySelector`, `fetch`, `localStorage`

✅ **Use for:**

- Third-party packages: `zod`, `sharp`, `bull`, `ioredis`, `react-hook-form`
- Framework plugins: `next-pwa`, `@auth/core`, `prisma` adapters
- Specialized libraries: `pdfkit`, `winston` transports, `yup`

### When to Skip This Skill

Answer directly for widely-known packages:

- Common: `express`, `react`, `vue`, `lodash`, `axios`, `jest`
- Claude has sufficient training data for these

Use this skill for:

- Specialized/niche packages
- Framework-specific plugins
- Lesser-known libraries
- Unfamiliar packages

## Quick Reference

### Context7 Tools

**resolve-library-id(libraryName, query)**

- Converts package name → Context7 library ID
- Max 3 calls per question

**query-docs(libraryId, query)**

- Retrieves documentation for specific query
- Max 3 calls per question

### Agent

**dependency-docs-collector**

- Task tool: `subagent_type: "claudefiles:dependency-docs-collector"`
- Use for: New features, migrations, alternatives, troubleshooting, multi-package setups

## Common Patterns Summary

| Scenario | Tool | Example |
|----------|------|---------|
| Quick API lookup | Context7 | "Verify zod schema syntax" |
| Add library for feature | Agent | "Add job queue for background processing" |
| Migrate library | Agent | "Migrate joi to zod" |
| Find alternative | Agent | "Alternative to deprecated request library" |
| Troubleshoot error (simple) | Context7 | "Bull job status codes" |
| Troubleshoot error (complex) | Agent | "Debug zod validation failures" |
| Multi-package setup | Agent | "Configure next-auth + prisma + zod" |

---

**Version:** 0.1.0
**Plugin:** dotclaudefiles
' WHERE slug = 'diegopherlt-check-third-party-docs';