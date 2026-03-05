UPDATE skills SET content = '---
name: zustand-store-ts
description: Create Zustand stores with TypeScript, subscribeWithSelector middleware, and proper state/action separation. Use when building React state management, creating global stores, or implementing reactive state patterns with Zustand.
---

# Zustand Store

Create Zustand stores following established patterns with proper TypeScript types and middleware.

## Quick Start

Copy the template from [assets/template.ts](assets/template.ts) and replace placeholders:
- `{{StoreName}}` → PascalCase store name (e.g., `Project`)
- `{{description}}` → Brief description for JSDoc

## Always Use subscribeWithSelector

```typescript
import { create } from ''zustand'';
import { subscribeWithSelector } from ''zustand/middleware'';

export const useMyStore = create<MyStore>()(
  subscribeWithSelector((set, get) => ({
    // state and actions
  }))
);
```

## Separate State and Actions

```typescript
export interface MyState {
  items: Item[];
  isLoading: boolean;
}

export interface MyActions {
  addItem: (item: Item) => void;
  loadItems: () => Promise<void>;
}

export type MyStore = MyState & MyActions;
```

## Use Individual Selectors

```typescript
// Good - only re-renders when `items` changes
const items = useMyStore((state) => state.items);

// Avoid - re-renders on any state change
const { items, isLoading } = useMyStore();
```

## Subscribe Outside React

```typescript
useMyStore.subscribe(
  (state) => state.selectedId,
  (selectedId) => console.log(''Selected:'', selectedId)
);
```

## Integration Steps

1. Create store in `src/frontend/src/store/`
2. Export from `src/frontend/src/store/index.ts`
3. Add tests in `src/frontend/src/store/*.test.ts`
' WHERE slug = 'neversight-zustand-store-ts';
UPDATE skills SET content = '---
name: a11y
description: "Universal accessibility best practices and standards across all technologies (HTML, CSS, React, MUI, Astro, React Native). WCAG 2.1/2.2 Level AA compliance, semantic HTML, ARIA, keyboard navigation, color contrast. Trigger: When implementing UI components, adding interactive elements, or ensuring accessibility compliance."
allowed-tools:
  - documentation-reader
  - web-search
  - file-reader
---

# Accessibility (a11y) Skill

## Overview

This skill centralizes accessibility guidelines and best practices for all technologies and frameworks used in the project, including HTML, CSS, React, MUI, Astro, React Native, and more. It covers semantic structure, ARIA usage, color contrast, keyboard navigation, and compliance with WCAG and WAI-ARIA standards.

## Objective

Ensure all user interfaces meet accessibility standards (WCAG 2.1/2.2 Level AA minimum) across all technologies. This skill provides universal accessibility guidance that technology-specific skills can reference.

---

## When to Use

Use this skill when:

- Building UI components with interactive elements
- Implementing forms, modals, or custom widgets
- Adding dynamic content or live regions
- Ensuring keyboard navigation
- Reviewing accessibility compliance
- Testing with screen readers

Don''t use this skill for:

- Technology-specific implementation (delegate to react, html, etc.)
- General coding patterns (use conventions skill)
- Pure backend logic (no UI)

---

## Critical Patterns

### ✅ REQUIRED: Semantic HTML Elements

```html
<!-- ✅ CORRECT: Semantic elements -->
<nav>
  <a href="/home">Home</a>
</nav>
<main>
  <article>Content</article>
</main>
<button onClick="{action}">Submit</button>

<!-- ❌ WRONG: Non-semantic divs -->
<div class="nav">
  <div onClick="{navigate}">Home</div>
</div>
<div class="main">
  <div>Content</div>
</div>
<div onClick="{action}">Submit</div>
```

### ✅ REQUIRED: Keyboard Accessibility

```typescript
// ✅ CORRECT: Keyboard events
<button
  onClick={handleClick}
  onKeyDown={(e) => e.key === ''Enter'' && handleClick()}
>

// ❌ WRONG: Mouse-only events
<div onClick={handleClick}> // Not keyboard accessible
```

### ✅ REQUIRED: Form Labels

```html
<!-- ✅ CORRECT: Associated label -->
<label htmlFor="email">Email Address</label>
<input id="email" type="email" />

<!-- ❌ WRONG: No label association -->
<div>Email Address</div>
<input type="email" />
```

### ✅ REQUIRED: Alt Text for Images

```html
<!-- ✅ CORRECT: Descriptive alt for informative images -->
<img src="chart.png" alt="Sales increased 25% in Q4" />

<!-- ✅ CORRECT: Empty alt for decorative images -->
<img src="decorative-border.png" alt="" />

<!-- ❌ WRONG: Missing alt -->
<img src="chart.png" />
```

---

## Conventions

### Semantic HTML

- Use semantic elements (`<nav>`, `<main>`, `<article>`, `<aside>`, `<footer>`)
- Proper heading hierarchy (h1 → h2 → h3, no skipping levels)
- Use `<button>` for actions, `<a>` for navigation
- Form labels must be associated with inputs

### ARIA

- Use ARIA only when semantic HTML is insufficient
- Prefer native elements over ARIA roles
- Common patterns: `aria-label`, `aria-labelledby`, `aria-describedby`
- Required for dynamic content: `aria-live`, `aria-atomic`

### Keyboard Navigation

- All interactive elements must be keyboard accessible
- Logical tab order (use tabindex only when necessary)
- Visible focus indicators
- Escape key closes modals/dropdowns

### Color and Contrast

- Text contrast ratio 4.5:1 minimum (7:1 for Level AAA)
- Large text (18pt+) minimum 3:1
- Don''t rely solely on color to convey information
- Test with color blindness simulators
- **UI component contrast 3:1** (WCAG 2.1)
- **Focus indicators contrast 3:1** (WCAG 2.2)

### Touch Targets & Interaction

- **Touch target size minimum 24x24px** (WCAG 2.2)
- Recommend 44x44px for better usability (WCAG 2.1 AAA)
- Adequate spacing between targets
- **No dragging movements required** unless essential (WCAG 2.2)

### Screen Readers

- Provide alternative text for images (`alt` attribute)
- Use `aria-hidden="true"` for decorative elements
- Announce dynamic content changes with `aria-live`
- Test with screen readers (NVDA, JAWS, VoiceOver)

## Decision Tree

**Interactive element (button, link)?** → Ensure keyboard accessible (Tab, Enter/Space), visible focus indicator, proper role and semantic element.

**Form field?** → Associate `<label>` with input (htmlFor/id), provide error messages with `aria-describedby`, announce errors with `aria-live`.

**Dynamic content change?** → Use `aria-live="polite"` for non-urgent updates, `aria-live="assertive"` for critical alerts, `aria-atomic="true"` if entire region should be read.

**Custom widget (dropdown, modal, tabs)?** → Follow WAI-ARIA Authoring Practices patterns, implement keyboard navigation (Arrow keys, Escape, Enter), manage focus properly.

**Image or icon?** → Decorative: `alt=""` or `aria-hidden="true"`. Informative: descriptive `alt` text. Icon-only button: `aria-label`.

**Color conveys meaning?** → Add text label, icon, or pattern. Verify 4.5:1 contrast ratio for text, 3:1 for UI components.

**Modal or overlay?** → Trap focus inside modal, restore focus on close, allow Escape to dismiss, use `aria-modal="true"` and `role="dialog"`.

**Loading or status change?** → Use `aria-busy="true"` during loading, `role="status"` for status messages, ensure screen reader announces completion.

---

## Edge Cases

WCAG 2.2 updates:\*\*

- **24x24px minimum target size** (lowered from 44x44, but 44x44 still recommended)
- **Focus appearance:** Focus indicators must have 3:1 contrast ratio
- **Dragging movements:** Provide single-pointer alternatives for drag operations
- **Redundant entry:** Don''t make users re-enter information already provided
- **Accessible authentication:** Don''t require cognitive function tests (CAPTCHAs should have alternatives)

\*\*
**Skip links:** Provide "Skip to main content" link as first focusable element for keyboard users to bypass navigation.

**Focus trap issues:** Libraries like React may interfere with focus management. Test focus trap explicitly in modals.

**ARIA live regions throttling:** Rapid updates may be throttled by screen readers. Debounce updates or use atomic regions.

**Touch target size:** Minimum 44x44 pixels for touch targets (WCAG 2.1). Use padding to increase clickable area.

**Hidden content:** Use `aria-hidden="true"` for visual-only elements. Use `sr-only` class for screen-reader-only text.

**Custom controls:** For complex widgets (datepickers, sliders), follow WAI-ARIA Authoring Practices patterns exactly.

---

## References

- https://www.w3.org/WAI/WCAG21/quickref/
- https://www.w3.org/WAI/ARIA/apg/
' WHERE slug = 'neversight-a11y';
UPDATE skills SET content = '---
name: fastapi-fullstack
description: Python full-stack with FastAPI, React, PostgreSQL, and Docker.
---

# FastAPI Full Stack

A Python full-stack application with FastAPI backend.

## Tech Stack

- **Backend**: FastAPI, Python
- **Frontend**: React
- **Database**: PostgreSQL
- **ORM**: SQLAlchemy

## Prerequisites

- Python 3.11+
- Docker (recommended)

## Setup

### 1. Clone the Template

```bash
git clone --depth 1 https://github.com/tiangolo/full-stack-fastapi-template.git .
```

If the directory is not empty:

```bash
git clone --depth 1 https://github.com/tiangolo/full-stack-fastapi-template.git _temp_template
mv _temp_template/* _temp_template/.* . 2>/dev/null || true
rm -rf _temp_template
```

### 2. Remove Git History (Optional)

```bash
rm -rf .git
git init
```

### 3. Setup with Docker (Recommended)

```bash
docker compose up -d
```

### 4. Or Setup Manually

```bash
cd backend
pip install -r requirements.txt
```

## Development

With Docker:
```bash
docker compose up -d
```

Manual:
```bash
cd backend
uvicorn main:app --reload
```
' WHERE slug = 'neversight-fastapi-fullstack';
UPDATE skills SET content = '---
name: context7
description: |
  Fetch up-to-date library documentation via Context7 API. Use PROACTIVELY when:
  (1) Working with ANY external library (React, Next.js, Supabase, etc.)
  (2) User asks about library APIs, patterns, or best practices
  (3) Implementing features that rely on third-party packages
  (4) Debugging library-specific issues
  (5) Need current documentation beyond training data cutoff
  (6) AND MOST IMPORTANTLY, when you are installing dependencies, libraries, or frameworks you should ALWAYS check the docs to see what the latest versions are. Do not rely on outdated knowledge.
  Always prefer this over guessing library APIs or using outdated knowledge.
---

# Context7 Documentation Fetcher

Retrieve current library documentation via Context7 API.

## Authentication

This skill requires a Context7 API key in `CONTEXT7_API_KEY`.

Recommended setup options:
1) Export it in your shell profile (global):

```bash
export CONTEXT7_API_KEY="your-context7-key"
```

2) Use a local `.env` file (per-repo):

```bash
cp skills/context7/.env.example .env
set -a; source .env; set +a
```

## Workflow

### 1. Search for the library

```bash
python3 ~/.codex/skills/context7/scripts/context7.py search "<library-name>"
```

Example:
```bash
python3 ~/.codex/skills/context7/scripts/context7.py search "next.js"
```

Returns library metadata including the `id` field needed for step 2.

### 2. Fetch documentation context

```bash
python3 ~/.codex/skills/context7/scripts/context7.py context "<library-id>" "<query>"
```

Example:
```bash
python3 ~/.codex/skills/context7/scripts/context7.py context "/vercel/next.js" "app router middleware"
```

Options:
- `--type txt|md` - Output format (default: txt)
- `--tokens N` - Limit response tokens

## Quick Reference

| Task | Command |
|------|---------|
| Find React docs | `search "react"` |
| Get React hooks info | `context "/facebook/react" "useEffect cleanup"` |
| Find Supabase | `search "supabase"` |
| Get Supabase auth | `context "/supabase/supabase" "authentication row level security"` |

## When to Use

- Before implementing any library-dependent feature
- When unsure about current API signatures
- For library version-specific behavior
- To verify best practices and patterns
' WHERE slug = 'neversight-context7-ill-md';
UPDATE skills SET content = '---
name: svg-to-react
description: Converts SVG files into optimized React TypeScript components with proper accessibility attributes, currentColor fills, and consistent naming conventions. Use when adding icons or SVG assets to a React project.
---

# SVG to React

Act as a senior React and TypeScript engineer specializing in SVG optimization and React component generation.

Convert the following SVG to a React component: $ARGUMENTS

## Rules

- Always use TypeScript.
- Always add aria-hidden="true" to SVGs.
- Always spread props to allow style overrides.
- Always format component name as PascalCase + "Icon" suffix.
- Always use IconProps from ''~/utils/types''.
- Always use className prop for styling.
- Always use currentColor for fill.
- Format output with 2 space indentation.
- Sort SVG attributes alphabetically.
- Extract viewBox from width/height if not present.
- Remove hardcoded dimensions (width, height).
- Remove fill="none" from root svg.
- Remove fill="#fff" from paths.
- Remove unnecessary groups and clip paths.
- Export as named function component.
- Use type import for IconProps.
- Spread props last to allow overrides.
- Preserve SVG viewBox.
- Remove hardcoded colors.
- Place each component in its own file.
- Name the file same as the component in kebab-case.
- Delete original SVG file after successful conversion.

## Example Output

```tsx
import type { IconProps } from ''~/utils/types'';

export function ShortsIcon({ className, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        fillRule="evenodd"
        d="..."
        clipRule="evenodd"
      />
    </svg>
  );
}
```
' WHERE slug = 'neversight-svg-to-react';
UPDATE skills SET content = '---
name: google-chat-api
description: |
  Build Google Chat bots and webhooks with Cards v2, interactive forms, and Cloudflare Workers. Covers Spaces/Members/Reactions APIs, bearer token verification, and dialog patterns.

  Use when: creating Chat bots, workflow automation, interactive forms. Troubleshoot: bearer token 401, rate limit 429, card schema validation, webhook failures.
user-invocable: true
---

# Google Chat API

**Status**: Production Ready
**Last Updated**: 2026-01-09 (Added: Spaces API, Members API, Reactions API, Rate Limits)
**Dependencies**: Cloudflare Workers (recommended), Web Crypto API for token verification
**Latest Versions**: Google Chat API v1 (stable), Cards v2 (Cards v1 deprecated), wrangler@4.54.0

---

## Quick Start (5 Minutes)

### 1. Create Webhook (Simplest Approach)

```bash
# No code needed - just configure in Google Chat
# 1. Go to Google Cloud Console
# 2. Create new project or select existing
# 3. Enable Google Chat API
# 4. Configure Chat app with webhook URL
```

**Webhook URL**: `https://your-worker.workers.dev/webhook`

**Why this matters:**
- Simplest way to send messages to Chat
- No authentication required for incoming webhooks
- Perfect for notifications from external systems
- Limited to sending messages (no interactive responses)

### 2. Create Interactive Bot (Cloudflare Worker)

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const event = await request.json()

    // Respond with a card
    return Response.json({
      text: "Hello from bot!",
      cardsV2: [{
        cardId: "unique-card-1",
        card: {
          header: { title: "Welcome" },
          sections: [{
            widgets: [{
              textParagraph: { text: "Click the button below" }
            }, {
              buttonList: {
                buttons: [{
                  text: "Click me",
                  onClick: {
                    action: {
                      function: "handleClick",
                      parameters: [{ key: "data", value: "test" }]
                    }
                  }
                }]
              }
            }]
          }]
        }
      }]
    })
  }
}
```

**CRITICAL:**
- **Must respond within timeout** (typically 30 seconds)
- **Always return valid JSON** with `cardsV2` array
- **Card schema must be exact** - one wrong field breaks the whole card

### 3. Verify Bearer Tokens (Production Security)

```typescript
async function verifyToken(token: string): Promise<boolean> {
  // Verify token is signed by chat@system.gserviceaccount.com
  // See templates/bearer-token-verify.ts for full implementation
  return true
}
```

**Why this matters:**
- Prevents unauthorized access to your bot
- Required for HTTP endpoints (not webhooks)
- Uses Web Crypto API (Cloudflare Workers compatible)

---

## The 3-Step Setup Process

### Step 1: Choose Integration Type

**Option A: Incoming Webhook (Notifications Only)**

Best for:
- CI/CD notifications
- Alert systems
- One-way communication
- External service → Chat

**Setup**:
1. Create Chat space
2. Configure incoming webhook in Space settings
3. POST JSON to webhook URL

**No code required** - just HTTP POST:
```bash
curl -X POST ''https://chat.googleapis.com/v1/spaces/.../messages?key=...'' \
  -H ''Content-Type: application/json'' \
  -d ''{"text": "Hello from webhook!"}''
```

**Option B: HTTP Endpoint Bot (Interactive)**

Best for:
- Interactive forms
- Button-based workflows
- User input collection
- Chat → Your service → Chat

**Setup**:
1. Create Google Cloud project
2. Enable Chat API
3. Configure Chat app with HTTP endpoint
4. Deploy Cloudflare Worker
5. Handle events and respond with cards

**Requires code** - see `templates/interactive-bot.ts`

### Step 2: Design Cards (If Using Interactive Bot)

**IMPORTANT**: Use Cards v2 only. Cards v1 was deprecated in 2025. Cards v2 matches Material Design on web (faster rendering, better aesthetics).

Cards v2 structure:
```json
{
  "cardsV2": [{
    "cardId": "unique-id",
    "card": {
      "header": {
        "title": "Card Title",
        "subtitle": "Optional subtitle",
        "imageUrl": "https://..."
      },
      "sections": [{
        "header": "Section 1",
        "widgets": [
          { "textParagraph": { "text": "Some text" } },
          { "buttonList": { "buttons": [...] } }
        ]
      }]
    }
  }]
}
```

**Widget Types**:
- `textParagraph` - Text content
- `buttonList` - Buttons (text or icon)
- `textInput` - Text input field
- `selectionInput` - Dropdowns, checkboxes, switches
- `dateTimePicker` - Date/time selection
- `divider` - Horizontal line
- `image` - Images
- `decoratedText` - Text with icon/button

**Text Formatting** (NEW: Sept 2025 - GA):

Cards v2 supports both HTML and Markdown formatting:

```typescript
// HTML formatting (traditional)
{
  textParagraph: {
    text: "This is <b>bold</b> and <i>italic</i> text with <font color=''#ea9999''>color</font>"
  }
}

// Markdown formatting (NEW - better for AI agents)
{
  textParagraph: {
    text: "This is **bold** and *italic* text\n\n- Bullet list\n- Second item\n\n```\ncode block\n```"
  }
}
```

**Supported Markdown** (text messages and cards):
- `**bold**` or `*italic*`
- `` `code` `` for inline code
- `- list item` or `1. ordered` for lists
- ` ```code block``` ` for multi-line code
- `~strikethrough~`

**Supported HTML** (cards only):
- `<b>bold</b>`, `<i>italic</i>`, `<u>underline</u>`
- `<font color="#FF0000">colored</font>`
- `<a href="url">link</a>`

**Why Markdown matters**: LLMs naturally output Markdown. Before Sept 2025, you had to convert Markdown→HTML. Now you can pass Markdown directly to Chat.

**CRITICAL**:
- **Max 100 widgets per card** - silently truncated if exceeded
- **Widget order matters** - displayed top to bottom
- **cardId must be unique** - use timestamp or UUID

### Step 3: Handle User Interactions

When user clicks button or submits form:

```typescript
export default {
  async fetch(request: Request): Promise<Response> {
    const event = await request.json()

    // Check event type
    if (event.type === ''MESSAGE'') {
      // User sent message
      return handleMessage(event)
    }

    if (event.type === ''CARD_CLICKED'') {
      // User clicked button
      const action = event.action.actionMethodName
      const params = event.action.parameters

      if (action === ''submitForm'') {
        return handleFormSubmission(event)
      }
    }

    return Response.json({ text: "Unknown event" })
  }
}
```

**Event Types**:
- `ADDED_TO_SPACE` - Bot added to space
- `REMOVED_FROM_SPACE` - Bot removed
- `MESSAGE` - User sent message
- `CARD_CLICKED` - User clicked button/submitted form

---

## Critical Rules

### Always Do

✅ Return valid JSON with `cardsV2` array structure
✅ Set unique `cardId` for each card
✅ Verify bearer tokens for HTTP endpoints (production)
✅ Handle all event types (MESSAGE, CARD_CLICKED, etc.)
✅ Keep widget count under 100 per card
✅ Validate form inputs server-side

### Never Do

❌ Store secrets in code (use Cloudflare Workers secrets)
❌ Exceed 100 widgets per card (silently fails)
❌ Return malformed JSON (breaks entire message)
❌ Skip bearer token verification (security risk)
❌ Trust client-side validation only (validate server-side)
❌ Use synchronous blocking operations (timeout risk)

---

## Known Issues Prevention

This skill prevents **6** documented issues:

### Issue #1: Bearer Token Verification Fails (401)
**Error**: "Unauthorized" or "Invalid credentials"
**Source**: Google Chat API Documentation
**Why It Happens**: Token not verified or wrong verification method
**Prevention**: Template includes Web Crypto API verification (Cloudflare Workers compatible)

### Issue #2: Invalid Card JSON Schema (400)
**Error**: "Invalid JSON payload" or "Unknown field"
**Source**: Cards v2 API Reference
**Why It Happens**: Typo in field name, wrong nesting, or extra fields
**Prevention**: Use `google-chat-cards` library or templates with exact schema

### Issue #3: Widget Limit Exceeded (Silent Failure)
**Error**: No error - widgets beyond 100 simply don''t render
**Source**: Google Chat API Limits
**Why It Happens**: Adding too many widgets to single card
**Prevention**: Skill documents 100 widget limit + pagination patterns

### Issue #4: Form Validation Error Format Wrong
**Error**: Form doesn''t show validation errors to user
**Source**: Interactive Cards Documentation
**Why It Happens**: Wrong error response format
**Prevention**: Templates include correct error format:
```json
{
  "actionResponse": {
    "type": "DIALOG",
    "dialogAction": {
      "actionStatus": {
        "statusCode": "INVALID_ARGUMENT",
        "userFacingMessage": "Email is required"
      }
    }
  }
}
```

### Issue #5: Webhook "Unable to Connect" Error
**Error**: Chat shows "Unable to connect to bot"
**Source**: Webhook Setup Guide
**Why It Happens**: URL not publicly accessible, timeout, or wrong response format
**Prevention**: Skill includes timeout handling + response format validation

### Issue #6: Rate Limit Exceeded (429)
**Error**: "RESOURCE_EXHAUSTED" or 429 status code
**Source**: Google Chat API Quotas
**Why It Happens**: Exceeding per-project, per-space, or per-user request limits
**Prevention**: Skill documents rate limits + exponential backoff pattern

---

## Configuration Files Reference

### Cloudflare Worker (wrangler.jsonc)

```jsonc
{
  "name": "google-chat-bot",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-03",
  "compatibility_flags": ["nodejs_compat"],

  // Secrets (set with: wrangler secret put CHAT_BOT_TOKEN)
  "vars": {
    "ALLOWED_SPACES": "spaces/SPACE_ID_1,spaces/SPACE_ID_2"
  }
}
```

**Why these settings:**
- `nodejs_compat` - Required for Web Crypto API (token verification)
- Secrets stored securely (not in code)
- Environment variables for configuration

---

## Common Patterns

### Pattern 1: Notification Bot (Webhook)

```typescript
// External service sends notification to Chat
async function sendNotification(webhookUrl: string, message: string) {
  await fetch(webhookUrl, {
    method: ''POST'',
    headers: { ''Content-Type'': ''application/json'' },
    body: JSON.stringify({
      text: message,
      cardsV2: [{
        cardId: `notif-${Date.now()}`,
        card: {
          header: { title: "Alert" },
          sections: [{
            widgets: [{
              textParagraph: { text: message }
            }]
          }]
        }
      }]
    })
  })
}
```

**When to use**: CI/CD alerts, monitoring notifications, event triggers

### Pattern 2: Interactive Form

```typescript
// Show form to collect data
function showForm() {
  return {
    cardsV2: [{
      cardId: "form-card",
      card: {
        header: { title: "Enter Details" },
        sections: [{
          widgets: [
            {
              textInput: {
                name: "email",
                label: "Email",
                type: "SINGLE_LINE",
                hintText: "user@example.com"
              }
            },
            {
              selectionInput: {
                name: "priority",
                label: "Priority",
                type: "DROPDOWN",
                items: [
                  { text: "Low", value: "low" },
                  { text: "High", value: "high" }
                ]
              }
            },
            {
              buttonList: {
                buttons: [{
                  text: "Submit",
                  onClick: {
                    action: {
                      function: "submitForm",
                      parameters: [{
                        key: "formId",
                        value: "contact-form"
                      }]
                    }
                  }
                }]
              }
            }
          ]
        }]
      }
    }]
  }
}
```

**When to use**: Data collection, approval workflows, ticket creation

### Pattern 3: Dialog (Modal)

```typescript
// Open modal dialog
function openDialog() {
  return {
    actionResponse: {
      type: "DIALOG",
      dialogAction: {
        dialog: {
          body: {
            sections: [{
              header: "Confirm Action",
              widgets: [{
                textParagraph: { text: "Are you sure?" }
              }, {
                buttonList: {
                  buttons: [
                    {
                      text: "Confirm",
                      onClick: {
                        action: { function: "confirm" }
                      }
                    },
                    {
                      text: "Cancel",
                      onClick: {
                        action: { function: "cancel" }
                      }
                    }
                  ]
                }
              }]
            }]
          }
        }
      }
    }
  }
}
```

**When to use**: Confirmations, multi-step workflows, focused data entry

---

## Using Bundled Resources

### Scripts (scripts/)

No executable scripts for this skill.

### Templates (templates/)

**Required for all projects:**
- `templates/webhook-handler.ts` - Basic webhook receiver
- `templates/wrangler.jsonc` - Cloudflare Workers config

**Optional based on needs:**
- `templates/interactive-bot.ts` - HTTP endpoint with event handling
- `templates/card-builder-examples.ts` - Common card patterns
- `templates/form-validation.ts` - Input validation with error responses
- `templates/bearer-token-verify.ts` - Token verification utility

**When to load these**: Claude should reference templates when user asks to:
- Set up Google Chat bot
- Create interactive cards
- Add form validation
- Verify bearer tokens
- Handle button clicks

### References (references/)

- `references/google-chat-docs.md` - Key documentation links
- `references/cards-v2-schema.md` - Complete card structure reference
- `references/common-errors.md` - Error troubleshooting guide

**When Claude should load these**: Troubleshooting errors, designing cards, understanding API

---

## Advanced Topics

### Slash Commands

Register slash commands for quick actions:

```typescript
// User types: /create-ticket Bug in login
if (event.message?.slashCommand?.commandName === ''create-ticket'') {
  const text = event.message.argumentText

  return Response.json({
    text: `Creating ticket: ${text}`,
    cardsV2: [/* ticket confirmation card */]
  })
}
```

**Use cases**: Quick actions, shortcuts, power user features

### Thread Replies

Reply in existing thread:

```typescript
return Response.json({
  text: "Reply in thread",
  thread: {
    name: event.message.thread.name  // Use existing thread
  }
})
```

**Use cases**: Conversations, follow-ups, grouped discussions

---

## Spaces API

Programmatically manage Google Chat spaces (rooms). Requires [Chat Admin or App permissions](https://developers.google.com/workspace/chat/authenticate-authorize).

### Available Methods

| Method | Description | Scope Required |
|-----

<!-- truncated -->' WHERE slug = 'neversight-google-chat-api';
UPDATE skills SET content = '---
name: tinacms
description: |
  Build content-heavy sites with Git-backed TinaCMS. Provides visual editing and content management for blogs, documentation, and marketing sites with non-technical editors.

  Use when implementing Next.js, Vite+React, or Astro CMS setups, self-hosting on Cloudflare Workers, or troubleshooting ESbuild compilation errors, module resolution issues, or Docker binding problems.
license: MIT
allowed-tools: [''Read'', ''Write'', ''Edit'', ''Bash'', ''Glob'', ''Grep'']
metadata:
  token_savings: "65-70%"
  errors_prevented: 9
  package_version: "2.9.0"
  cli_version: "1.11.0"
  last_verified: "2025-10-24"
  frameworks: ["Next.js", "Vite+React", "Astro", "Framework-agnostic"]
  deployment: ["TinaCloud", "Cloudflare Workers", "Vercel", "Netlify"]
---

# TinaCMS Skill

Complete skill for integrating TinaCMS into modern web applications.

---

## What is TinaCMS?

**TinaCMS** is an open-source, Git-backed headless content management system (CMS) that enables developers and content creators to collaborate seamlessly on content-heavy websites.

### Key Features

1. **Git-Backed Storage**
   - Content stored as Markdown, MDX, or JSON files in Git repository
   - Full version control and change history
   - No vendor lock-in - content lives in your repo

2. **Visual/Contextual Editing**
   - Side-by-side editing experience
   - Live preview of changes as you type
   - WYSIWYG-like editing for Markdown content

3. **Schema-Driven Content Modeling**
   - Define content structure in code (`tina/config.ts`)
   - Type-safe GraphQL API auto-generated from schema
   - Collections and fields system for organized content

4. **Flexible Deployment**
   - **TinaCloud**: Managed service (easiest, free tier available)
   - **Self-Hosted**: Cloudflare Workers, Vercel Functions, Netlify Functions, AWS Lambda
   - Multiple authentication options (Auth.js, custom, local dev)

5. **Framework Support**
   - **Best**: Next.js (App Router + Pages Router)
   - **Good**: React, Astro (experimental visual editing), Gatsby, Hugo, Jekyll, Remix, 11ty
   - **Framework-Agnostic**: Works with any framework (visual editing limited to React)

### Current Versions

- **tinacms**: 2.9.0 (September 2025)
- **@tinacms/cli**: 1.11.0 (October 2025)
- **React Support**: 19.x (>=18.3.1 <20.0.0)

---

## When to Use This Skill

### ✅ Use TinaCMS When:

1. **Building Content-Heavy Sites**
   - Blogs and personal websites
   - Documentation sites
   - Marketing websites
   - Portfolio sites

2. **Non-Technical Editors Need Access**
   - Content teams without coding knowledge
   - Marketing teams managing pages
   - Authors writing blog posts

3. **Git-Based Workflow Desired**
   - Want content versioning through Git
   - Need content review through pull requests
   - Prefer content in repository with code

4. **Visual Editing Required**
   - Editors want to see changes live
   - WYSIWYG experience preferred
   - Side-by-side editing workflow

### ❌ Don''t Use TinaCMS When:

1. **Real-Time Collaboration Needed**
   - Multiple users editing simultaneously (Google Docs-style)
   - Use Sanity, Contentful, or Firebase instead

2. **Highly Dynamic Data**
   - E-commerce product catalogs with frequent inventory changes
   - Real-time dashboards
   - Use traditional databases (D1, PostgreSQL) instead

3. **No Content Management Needed**
   - Application is data-driven, not content-driven
   - Hard-coded content is sufficient

---

## Setup Patterns by Framework

Use the appropriate setup pattern based on your framework choice.

### 1. Next.js Setup (Recommended)

#### App Router (Next.js 13+)

**Steps:**

1. **Initialize TinaCMS:**
   ```bash
   npx @tinacms/cli@latest init
   ```
   - When prompted for public assets directory, enter `public`

2. **Update package.json scripts:**
   ```json
   {
     "scripts": {
       "dev": "tinacms dev -c \"next dev\"",
       "build": "tinacms build && next build",
       "start": "tinacms build && next start"
     }
   }
   ```

3. **Set environment variables:**
   ```env
   # .env.local
   NEXT_PUBLIC_TINA_CLIENT_ID=your_client_id
   TINA_TOKEN=your_read_only_token
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Access admin interface:**
   ```
   http://localhost:3000/admin/index.html
   ```

**Key Files Created:**
- `tina/config.ts` - Schema configuration
- `app/admin/[[...index]]/page.tsx` - Admin UI route (if using App Router)

**Template**: See `templates/nextjs/tina-config-app-router.ts`

---

#### Pages Router (Next.js 12 and below)

**Setup is identical**, except admin route is:
- `pages/admin/[[...index]].tsx` instead of app directory

**Data Fetching Pattern:**
```tsx
// pages/posts/[slug].tsx
import { client } from ''../../tina/__generated__/client''
import { useTina } from ''tinacms/dist/react''

export default function BlogPost(props) {
  // Hydrate for visual editing
  const { data } = useTina({
    query: props.query,
    variables: props.variables,
    data: props.data
  })

  return (
    <article>
      <h1>{data.post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: data.post.body }} />
    </article>
  )
}

export async function getStaticProps({ params }) {
  const response = await client.queries.post({
    relativePath: `${params.slug}.md`
  })

  return {
    props: {
      data: response.data,
      query: response.query,
      variables: response.variables
    }
  }
}

export async function getStaticPaths() {
  const response = await client.queries.postConnection()
  const paths = response.data.postConnection.edges.map((edge) => ({
    params: { slug: edge.node._sys.filename }
  }))

  return { paths, fallback: ''blocking'' }
}
```

**Template**: See `templates/nextjs/tina-config-pages-router.ts`

---

### 2. Vite + React Setup

**Steps:**

1. **Install dependencies:**
   ```bash
   npm install react@^19 react-dom@^19 tinacms
   ```

2. **Initialize TinaCMS:**
   ```bash
   npx @tinacms/cli@latest init
   ```
   - Set public assets directory to `public`

3. **Update vite.config.ts:**
   ```typescript
   import { defineConfig } from ''vite''
   import react from ''@vitejs/plugin-react''

   export default defineConfig({
     plugins: [react()],
     server: {
       port: 3000  // TinaCMS default
     }
   })
   ```

4. **Update package.json scripts:**
   ```json
   {
     "scripts": {
       "dev": "tinacms dev -c \"vite\"",
       "build": "tinacms build && vite build",
       "preview": "vite preview"
     }
   }
   ```

5. **Create admin interface:**

   **Option A: Manual route (React Router)**
   ```tsx
   // src/pages/Admin.tsx
   import TinaCMS from ''tinacms''

   export default function Admin() {
     return <div id="tina-admin" />
   }
   ```

   **Option B: Direct HTML**
   ```html
   <!-- public/admin/index.html -->
   <!DOCTYPE html>
   <html>
     <head>
       <meta charset="utf-8" />
       <title>Tina CMS</title>
       <meta name="viewport" content="width=device-width, initial-scale=1" />
     </head>
     <body>
       <div id="root"></div>
       <script type="module" src="/@fs/[path-to-tina-admin]"></script>
     </body>
   </html>
   ```

6. **Use useTina hook for visual editing:**
   ```tsx
   import { useTina } from ''tinacms/dist/react''
   import { client } from ''../tina/__generated__/client''

   function BlogPost({ initialData }) {
     const { data } = useTina({
       query: initialData.query,
       variables: initialData.variables,
       data: initialData.data
     })

     return (
       <article>
         <h1>{data.post.title}</h1>
         <div>{/* render body */}</div>
       </article>
     )
   }
   ```

7. **Set environment variables:**
   ```env
   # .env
   VITE_TINA_CLIENT_ID=your_client_id
   VITE_TINA_TOKEN=your_read_only_token
   ```

**Template**: See `templates/vite-react/`

---

### 3. Astro Setup

**Steps:**

1. **Use official starter (recommended):**
   ```bash
   npx create-tina-app@latest --template tina-astro-starter
   ```

   **Or initialize manually:**
   ```bash
   npx @tinacms/cli@latest init
   ```

2. **Update package.json scripts:**
   ```json
   {
     "scripts": {
       "dev": "tinacms dev -c \"astro dev\"",
       "build": "tinacms build && astro build",
       "preview": "astro preview"
     }
   }
   ```

3. **Configure Astro:**
   ```javascript
   // astro.config.mjs
   import { defineConfig } from ''astro/config''
   import react from ''@astro/react''

   export default defineConfig({
     integrations: [react()]  // Required for Tina admin
   })
   ```

4. **Visual editing (experimental):**
   - Requires React components
   - Use `client:tinaDirective` for interactive editing
   - Full visual editing is experimental as of October 2025

5. **Set environment variables:**
   ```env
   # .env
   PUBLIC_TINA_CLIENT_ID=your_client_id
   TINA_TOKEN=your_read_only_token
   ```

**Best For**: Content-focused static sites, documentation, blogs

**Template**: See `templates/astro/`

---

### 4. Framework-Agnostic Setup

**Applies to**: Hugo, Jekyll, Eleventy, Gatsby, Remix, or any framework

**Steps:**

1. **Initialize TinaCMS:**
   ```bash
   npx @tinacms/cli@latest init
   ```

2. **Manually configure build scripts:**
   ```json
   {
     "scripts": {
       "dev": "tinacms dev -c \"<your-dev-command>\"",
       "build": "tinacms build && <your-build-command>"
     }
   }
   ```

3. **Admin interface:**
   - Automatically created at `http://localhost:<port>/admin/index.html`
   - Port depends on your framework

4. **Data fetching:**
   - No visual editing (sidebar only)
   - Content edited through Git-backed interface
   - Changes saved directly to files

5. **Set environment variables:**
   ```env
   TINA_CLIENT_ID=your_client_id
   TINA_TOKEN=your_read_only_token
   ```

**Limitations:**
- No visual editing (React-only feature)
- Manual integration required
- Sidebar-based editing only

---

## Schema Modeling Best Practices

Define your content structure in `tina/config.ts`.

### Basic Config Structure

```typescript
import { defineConfig } from ''tinacms''

export default defineConfig({
  // Branch configuration
  branch: process.env.GITHUB_BRANCH ||
          process.env.VERCEL_GIT_COMMIT_REF ||
          ''main'',

  // TinaCloud credentials (if using managed service)
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID,
  token: process.env.TINA_TOKEN,

  // Build configuration
  build: {
    outputFolder: ''admin'',
    publicFolder: ''public'',
  },

  // Media configuration
  media: {
    tina: {
      mediaRoot: '''',
      publicFolder: ''public'',
    },
  },

  // Content schema
  schema: {
    collections: [
      // Define collections here
    ],
  },
})
```

---

### Collections

**Collection** = Content type + directory mapping

```typescript
{
  name: ''post'',           // Singular, internal name (used in API)
  label: ''Blog Posts'',    // Plural, display name (shown in admin)
  path: ''content/posts'',  // Directory where files are stored
  format: ''mdx'',          // File format: md, mdx, markdown, json, yaml, toml
  fields: [/* ... */]     // Array of field definitions
}
```

**Key Properties:**
- `name`: Internal identifier (alphanumeric + underscores only)
- `label`: Human-readable name for admin interface
- `path`: File path relative to project root
- `format`: File extension (defaults to ''md'')
- `fields`: Content structure definition

---

### Field Types Reference

| Type | Use Case | Example |
|------|----------|---------|
| `string` | Short text (single line) | Title, slug, author name |
| `rich-text` | Long formatted content | Blog body, page content |
| `number` | Numeric values | Price, quantity, rating |
| `datetime` | Date/time values | Published date, event time |
| `boolean` | True/false toggles | Draft status, featured flag |
| `image` | Image uploads | Hero image, thumbnail, avatar |
| `reference` | Link to another document | Author, category, related posts |
| `object` | Nested fields group | SEO metadata, social links |

**Complete reference**: See `references/field-types-reference.md`

---

### Collection Templates

#### Blog Post Collection

```typescript
{
  name: ''post'',
  label: ''Blog Posts'',
  path: ''content/posts'',
  format: ''mdx'',
  fields: [
    {
      type: ''string'',
      name: ''title'',
      label: ''Title'',
      isTitle: true,  // Shows in content list
      required: true
    },
    {
      type: ''string'',
      name: ''excerpt'',
      label: ''Excerpt'',
      ui: {
        component: ''textarea''  // Multi-line input
      }
    },
    {
      type: ''image'',
      name: ''coverImage'',
      label: ''Cover Image''
    },
    {
      type: ''datetime'',
      name: ''date'',
      label: ''Published Date'',
      required: true
    },
    {
      type: ''reference'',
      name: ''author'',
      label: ''Author'',
      collections: [''author'']  // References author collection
    },
    {
      type: ''boolean'',
      name: ''draft'',
      label: ''Draft'',
      description: ''If checked, post will not be published'',
      required: true
    },
    {
      type: ''rich-text'',
      name: ''body'',
      label: ''Body'',
      isBody: true  // Main content area
    }
  ],
  ui: {
    router: ({ document }) => `/blog/${document._sys.filename}`
  }
}
```

**Template**: See `templates/collections/blog-post.ts`

---

#### Documentation Page Collection

```typescript
{
  name: ''doc'',
  label: ''Documentation'',
  path: ''content/docs'',
  format: ''mdx'',
  fields: [
    {
      type: ''string'',
      name: ''title'',
      label: ''Title'',
      isTitle: true,
      required: true
    },
    {
      type: ''string'',
      name: ''description'',
      label: ''Description'',
      ui: {
        component: ''textarea''
      }
    },
    {
      type: ''number'',
      name: ''order'',
      label: ''Order'',
      description: ''Sort order in sidebar''
    },
    {
      type: ''rich-text'',
      name: ''body'',
      label: ''Body'',
      isBody: true,
      templates: [
        // MDX components can be defined here
      ]
    }
  ],
  ui: {
    router: ({ document }) => {
      const breadcrumbs = document._sys.breadcrumbs.join(''/'')
      return `/docs/${breadcrumbs}`
    }
  }
}
```

**Template**: See `templates/collections/doc-page.ts`

---

#### Author Collection (Reference Target)

```typescript
{
  name: ''author'',
  label: ''Authors'',
  path: ''content/authors'',
  format: ''json'',  // Use JSON for structured data
  fields: [
    {
      type: ''string'',
      name: ''name'',
      label: ''Name'',
      isTitle: true,
      required: true
    },
    {
      type: ''string'',
      name: ''email'',
      label: ''Email'',
      ui: {
        validate: (value) => {
          if (!value?.includes(''@'')) {
            return ''Invalid email address''
          }
        }
      }
    },
    {
      type: ''image'',
      name: ''avatar'',
      label: ''Avatar''
    },
    {
      type: ''string'',
      name: ''bio'',
      label: ''Bio'',
      ui: {
        component: ''textarea''
      }
    },
    {
      type: ''object'',
      name: ''social'',
      label: ''

<!-- truncated -->' WHERE slug = 'neversight-tinacms-ill-md';
UPDATE skills SET content = '---
name: content-collections
description: |
  Production-tested setup for Content Collections - a TypeScript-first build tool that transforms
  local content files (Markdown/MDX) into type-safe data collections with automatic validation.

  Use when: building blogs, documentation sites, or content-heavy applications with Vite + React,
  setting up MDX content with React components, implementing type-safe content schemas with Zod,
  migrating from Contentlayer, or encountering TypeScript import errors with content collections.

  Covers: Vite plugin setup, tsconfig path aliases, collection schemas with Zod validation,
  MDX compilation with compileMDX, transform functions for computed properties, rehype/remark plugins,
  React component integration with MDXContent, Cloudflare Workers deployment, and production build optimization.

  Keywords: content-collections, @content-collections/core, @content-collections/vite,
  @content-collections/mdx, MDX, markdown, Zod schema validation, type-safe content,
  frontmatter, compileMDX, defineCollection, defineConfig, Vite plugin, tsconfig paths,
  .content-collections/generated, MDXContent component, rehype plugins, remark plugins,
  content schema, document transform, allPosts import, static site generation,
  blog setup, documentation, Cloudflare Workers static assets, content validation errors,
  module not found content-collections, path alias not working, MDX type errors,
  transform function async, collection not updating
license: MIT
---

# Content Collections

**Status**: Production Ready ✅
**Last Updated**: 2025-11-07
**Dependencies**: None
**Latest Versions**: @content-collections/core@0.12.0, @content-collections/vite@0.2.7, zod@3.23.8

---

## What is Content Collections?

Content Collections transforms local content files (Markdown/MDX) into **type-safe TypeScript data** with automatic validation at build time.

**Problem it solves**: Manual content parsing, lack of type safety, runtime errors from invalid frontmatter.

**How it works**:
1. Define collections in `content-collections.ts` (name, directory, Zod schema)
2. CLI/plugin scans filesystem, parses frontmatter, validates against schema
3. Generates TypeScript modules in `.content-collections/generated/`
4. Import collections: `import { allPosts } from "content-collections"`

**Perfect for**: Blogs, documentation sites, content-heavy apps with Cloudflare Workers, Vite, Next.js.

---

## Quick Start (5 Minutes)

### 1. Install Dependencies

```bash
pnpm add -D @content-collections/core @content-collections/vite zod
```

### 2. Configure TypeScript Path Alias

Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "content-collections": ["./.content-collections/generated"]
    }
  }
}
```

###

 3. Configure Vite Plugin

Add to `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import contentCollections from "@content-collections/vite";

export default defineConfig({
  plugins: [
    react(),
    contentCollections(), // MUST come after react()
  ],
});
```

### 4. Update .gitignore

```
.content-collections/
```

### 5. Create Collection Config

Create `content-collections.ts` in project root:

```typescript
import { defineCollection, defineConfig } from "@content-collections/core";
import { z } from "zod";

const posts = defineCollection({
  name: "posts",
  directory: "content/posts",
  include: "*.md",
  schema: z.object({
    title: z.string(),
    date: z.string(),
    description: z.string(),
    content: z.string(),
  }),
});

export default defineConfig({
  collections: [posts],
});
```

### 6. Create Content Directory

```bash
mkdir -p content/posts
```

Create `content/posts/first-post.md`:

```markdown
---
title: My First Post
date: 2025-11-07
description: Introduction to Content Collections
---

# My First Post

Content goes here...
```

### 7. Import and Use

```typescript
import { allPosts } from "content-collections";

console.log(allPosts); // Fully typed!
```

**Result**: Type-safe content with autocomplete, validation, and HMR.

---

## Critical Rules

### ✅ Always Do:

1. **Add path alias to tsconfig.json** - Required for imports to work
2. **Add .content-collections to .gitignore** - Generated files shouldn''t be committed
3. **Use Standard Schema validators** - Zod, Valibot, ArkType supported
4. **Include `content` field in schema** - Required for frontmatter parsing
5. **Await compileMDX in transforms** - MDX compilation is async
6. **Put contentCollections() after react() in Vite** - Plugin order matters

### ❌ Never Do:

1. **Commit .content-collections directory** - Always generated, never committed
2. **Use non-standard validators** - Must support StandardSchema spec
3. **Forget to restart dev server after config changes** - Required for new collections
4. **Use sync transforms with async operations** - Transform must be async
5. **Double-wrap path alias** - Use `content-collections` not `./content-collections`
6. **Import from wrong package** - `@content-collections/core` for config, `content-collections` for data

---

## Known Issues Prevention

### Issue #1: Module not found: ''content-collections''

**Error**: `Cannot find module ''content-collections'' or its corresponding type declarations`

**Why it happens**: Missing TypeScript path alias configuration.

**Prevention**:

Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "content-collections": ["./.content-collections/generated"]
    }
  }
}
```

Restart TypeScript server in VS Code: `Cmd+Shift+P` → "TypeScript: Restart TS Server"

**Source**: Common user error

---

### Issue #2: Vite Constant Restart Loop

**Error**: Dev server continuously restarts, infinite loop.

**Why it happens**: Vite watching `.content-collections` directory changes, which triggers regeneration.

**Prevention**:

1. Add to `.gitignore`:
```
.content-collections/
```

2. Add to `vite.config.ts` (if still happening):
```typescript
export default defineConfig({
  server: {
    watch: {
      ignored: ["**/.content-collections/**"],
    },
  },
});
```

**Source**: GitHub Issue #591 (TanStack Start)

---

### Issue #3: Transform Types Not Reflected

**Error**: TypeScript types don''t match transformed documents.

**Why it happens**: TypeScript doesn''t automatically infer transform function return type.

**Prevention**:

Explicitly type your transform return:

```typescript
const posts = defineCollection({
  name: "posts",
  // ... schema
  transform: (post): PostWithSlug => ({ // Type the return!
    ...post,
    slug: post._meta.path.replace(/\.md$/, ""),
  }),
});

type PostWithSlug = {
  // ... schema fields
  slug: string;
};
```

**Source**: GitHub Issue #396

---

### Issue #4: Collection Not Updating on File Change

**Error**: New content files not appearing in collection.

**Why it happens**: Glob pattern doesn''t match, or dev server needs restart.

**Prevention**:

1. Verify glob pattern matches your files:
```typescript
include: "*.md"        // Only root files
include: "**/*.md"     // All nested files
include: "posts/*.md"  // Only posts/ folder
```

2. Restart dev server after adding new files outside watched patterns
3. Check file actually saved (watch for editor issues)

**Source**: Common user error

---

### Issue #5: MDX Type Errors with Shiki

**Error**: `esbuild errors with shiki langAlias` or compilation failures.

**Why it happens**: Version incompatibility between Shiki and Content Collections.

**Prevention**:

Use compatible versions:

```json
{
  "devDependencies": {
    "@content-collections/mdx": "^0.2.2",
    "shiki": "^1.0.0"
  }
}
```

Check official compatibility matrix in docs before upgrading Shiki.

**Source**: GitHub Issue #598 (Next.js 15)

---

### Issue #6: Custom Path Aliases in MDX Imports Fail

**Error**: MDX imports with `@` alias don''t resolve.

**Why it happens**: MDX compiler doesn''t respect tsconfig path aliases.

**Prevention**:

Use relative paths in MDX imports:

```mdx
<!-- ❌ Won''t work -->
import Component from "@/components/Component"

<!-- ✅ Works -->
import Component from "../../components/Component"
```

Or configure files appender (advanced, see references/transform-cookbook.md).

**Source**: GitHub Issue #547

---

### Issue #7: Unclear Validation Error Messages

**Error**: Cryptic Zod validation errors like "Expected string, received undefined".

**Why it happens**: Zod errors aren''t formatted for content context.

**Prevention**:

Add custom error messages to schema:

```typescript
schema: z.object({
  title: z.string({
    required_error: "Title is required in frontmatter",
    invalid_type_error: "Title must be a string",
  }),
  date: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    "Date must be valid ISO date (YYYY-MM-DD)"
  ),
})
```

**Source**: GitHub Issue #403

---

### Issue #8: Ctrl+C Doesn''t Stop Process

**Error**: Dev process hangs on exit, requires `kill -9`.

**Why it happens**: File watcher not cleaning up properly.

**Prevention**:

This is a known issue with the watcher. Workarounds:

1. Use `kill -9 <pid>` when it hangs
2. Use `content-collections watch` separately (not plugin) for more control
3. Add cleanup handler in `vite.config.ts` (advanced)

**Source**: GitHub Issue #546

---

## Configuration Patterns

### Basic Blog Collection

```typescript
import { defineCollection, defineConfig } from "@content-collections/core";
import { z } from "zod";

const posts = defineCollection({
  name: "posts",
  directory: "content/posts",
  include: "*.md",
  schema: z.object({
    title: z.string(),
    date: z.string(),
    description: z.string(),
    tags: z.array(z.string()).optional(),
    content: z.string(),
  }),
});

export default defineConfig({
  collections: [posts],
});
```

---

### Multi-Collection Setup

```typescript
const posts = defineCollection({
  name: "posts",
  directory: "content/posts",
  include: "*.md",
  schema: z.object({
    title: z.string(),
    date: z.string(),
    description: z.string(),
    content: z.string(),
  }),
});

const docs = defineCollection({
  name: "docs",
  directory: "content/docs",
  include: "**/*.md", // Nested folders
  schema: z.object({
    title: z.string(),
    category: z.string(),
    order: z.number().optional(),
    content: z.string(),
  }),
});

export default defineConfig({
  collections: [posts, docs],
});
```

---

### Transform Functions (Computed Fields)

```typescript
const posts = defineCollection({
  name: "posts",
  directory: "content/posts",
  include: "*.md",
  schema: z.object({
    title: z.string(),
    date: z.string(),
    content: z.string(),
  }),
  transform: (post) => ({
    ...post,
    slug: post._meta.path.replace(/\.md$/, ""),
    readingTime: Math.ceil(post.content.split(/\s+/).length / 200),
    year: new Date(post.date).getFullYear(),
  }),
});
```

---

### MDX with React Components

```typescript
import { compileMDX } from "@content-collections/mdx";

const posts = defineCollection({
  name: "posts",
  directory: "content/posts",
  include: "*.mdx",
  schema: z.object({
    title: z.string(),
    date: z.string(),
    content: z.string(),
  }),
  transform: async (post) => {
    const mdx = await compileMDX(post.content, {
      syntaxHighlighter: "shiki",
      shikiOptions: {
        theme: "github-dark",
      },
    });

    return {
      ...post,
      mdx,
      slug: post._meta.path.replace(/\.mdx$/, ""),
    };
  },
});
```

---

## React Component Integration

### Using Collections in React

```tsx
import { allPosts } from "content-collections";

export function BlogList() {
  return (
    <ul>
      {allPosts.map((post) => (
        <li key={post._meta.path}>
          <h2>{post.title}</h2>
          <p>{post.description}</p>
          <time>{post.date}</time>
        </li>
      ))}
    </ul>
  );
}
```

---

### Rendering MDX Content

```tsx
import { MDXContent } from "@content-collections/mdx/react";

export function BlogPost({ post }: { post: { mdx: string } }) {
  return (
    <article>
      <MDXContent code={post.mdx} />
    </article>
  );
}
```

---

## Cloudflare Workers Deployment

Content Collections is **perfect for Cloudflare Workers** because:
- Build-time only (no runtime filesystem access)
- Outputs static JavaScript modules
- No Node.js dependencies in generated code

### Deployment Pattern

```
Local Dev → content-collections build → vite build → wrangler deploy
```

### wrangler.toml

```toml
name = "my-content-site"
compatibility_date = "2025-11-07"

[assets]
directory = "./dist"
binding = "ASSETS"
```

### Build Script

`package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "deploy": "pnpm build && wrangler deploy"
  }
}
```

**Note**: Vite plugin handles `content-collections build` automatically!

---

## Using Bundled Resources

### Templates (templates/)

Copy-paste ready configuration files:

- `content-collections.ts` - Basic blog setup
- `content-collections-multi.ts` - Multiple collections
- `content-collections-mdx.ts` - MDX with syntax highlighting
- `tsconfig.json` - Complete TypeScript config
- `vite.config.ts` - Vite plugin setup
- `blog-post.md` - Example content file
- `BlogList.tsx` - React list component
- `BlogPost.tsx` - React MDX render component
- `wrangler.toml` - Cloudflare Workers config

### References (references/)

Deep-dive documentation for advanced topics:

- `schema-patterns.md` - Common Zod schema patterns
- `transform-cookbook.md` - Transform function recipes
- `mdx-components.md` - MDX + React integration
- `deployment-guide.md` - Cloudflare Workers setup

**When to load**: Claude should load these when you need advanced patterns beyond basic setup.

### Scripts (scripts/)

- `init-content-collections.sh` - One-command automated setup

---

## Dependencies

### Required

```json
{
  "devDependencies": {
    "@content-collections/core": "^0.12.0",
    "@content-collections/vite": "^0.2.7",
    "zod": "^3.23.8"
  }
}
```

### Optional (MDX)

```json
{
  "devDependencies": {
    "@content-collections/markdown": "^0.1.4",
    "@content-collections/mdx": "^0.2.2",
    "shiki": "^1.0.0"
  }
}
```

---

## Official Documentation

- **Official Site**: https://www.content-collections.dev
- **Documentation**: https://www.content-collections.dev/docs
- **GitHub**: https://github.com/sdorra/content-collections
- **Vite Plugin**: https://www.content-collections.dev/docs/vite
- **MDX Integration**: https://www.content-collections.dev/docs/mdx

---

## Package Versions (Verified 2025-11-07)

| Package | Version | Status |
|---------|---------|--------|
| @content-collections/core | 0.12.0 | ✅ Latest stable |
| @content-collections/vite | 0.2.7 | ✅ Latest stable |
| @content-collections/mdx | 0.2.2 | ✅ Latest stable |
| @content-collections/markdown | 0.1.4 | ✅ Latest stable |
| zod | 3.23.8 | ✅ Latest stable |

---

## Troubleshooting

### Problem: TypeScript can''t find ''content-co

<!-- truncated -->' WHERE slug = 'neversight-content-collections';
UPDATE skills SET content = '---
name: chat-ui
description: |
  Chat UI building blocks for React/Next.js from ui.inference.sh.
  Components: container, messages, input, typing indicators, avatars.
  Capabilities: chat interfaces, message lists, input handling, streaming.
  Use for: building custom chat UIs, messaging interfaces, AI assistants.
  Triggers: chat ui, chat component, message list, chat input, shadcn chat,
  react chat, chat interface, messaging ui, conversation ui, chat building blocks
---

# Chat UI Components

Chat building blocks from [ui.inference.sh](https://ui.inference.sh).

## Quick Start

```bash
# Install chat components
npx shadcn@latest add https://ui.inference.sh/r/chat.json
```

## Components

### Chat Container

```tsx
import { ChatContainer } from "@/registry/blocks/chat/chat-container"

<ChatContainer>
  {/* messages go here */}
</ChatContainer>
```

### Messages

```tsx
import { ChatMessage } from "@/registry/blocks/chat/chat-message"

<ChatMessage
  role="user"
  content="Hello, how can you help me?"
/>

<ChatMessage
  role="assistant"
  content="I can help you with many things!"
/>
```

### Chat Input

```tsx
import { ChatInput } from "@/registry/blocks/chat/chat-input"

<ChatInput
  onSubmit={(message) => handleSend(message)}
  placeholder="Type a message..."
  disabled={isLoading}
/>
```

### Typing Indicator

```tsx
import { TypingIndicator } from "@/registry/blocks/chat/typing-indicator"

{isTyping && <TypingIndicator />}
```

## Full Example

```tsx
import {
  ChatContainer,
  ChatMessage,
  ChatInput,
  TypingIndicator,
} from "@/registry/blocks/chat"

export function Chat() {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const handleSend = async (content: string) => {
    setMessages(prev => [...prev, { role: ''user'', content }])
    setIsLoading(true)
    // Send to API...
    setIsLoading(false)
  }

  return (
    <ChatContainer>
      {messages.map((msg, i) => (
        <ChatMessage key={i} role={msg.role} content={msg.content} />
      ))}
      {isLoading && <TypingIndicator />}
      <ChatInput onSubmit={handleSend} disabled={isLoading} />
    </ChatContainer>
  )
}
```

## Message Variants

| Role | Description |
|------|-------------|
| `user` | User messages (right-aligned) |
| `assistant` | AI responses (left-aligned) |
| `system` | System messages (centered) |

## Styling

Components use Tailwind CSS and shadcn/ui design tokens:

```tsx
<ChatMessage
  role="assistant"
  content="Hello!"
  className="bg-muted"
/>
```

## Related Skills

```bash
# Full agent component (recommended)
npx skills add inference-sh/skills@agent-ui

# Declarative widgets
npx skills add inference-sh/skills@widgets-ui

# Markdown rendering
npx skills add inference-sh/skills@markdown-ui
```

Docs: [ui.inference.sh/blocks/chat](https://ui.inference.sh/blocks/chat)
' WHERE slug = 'neversight-chat-ui-ill-md';
UPDATE skills SET content = '---
name: lit-best-practices
description: Lit web components best practices and performance optimization guidelines. Use when writing, reviewing, or refactoring Lit web components. Triggers on tasks involving Lit components, custom elements, shadow DOM, reactive properties, or web component performance.
license: MIT
author: community
version: 1.0.0
---

# Lit Web Components Best Practices

Best practices for building Lit web components, optimized for AI-assisted code generation and review.

## When to Use

Reference these guidelines when:

- Writing new Lit web components
- Implementing reactive properties and state
- Reviewing code for performance or accessibility issues
- Refactoring existing Lit components
- Optimizing rendering and update cycles

## Rule Categories

| Category | Rules | Focus |
|----------|-------|-------|
| 1. Component Structure | 4 rules | Properties, state, TypeScript |
| 2. Rendering | 5 rules | Templates, directives, derived state |
| 3. Styling | 4 rules | Static styles, theming, CSS parts |
| 4. Events | 3 rules | Custom events, naming, cleanup |
| 5. Lifecycle | 4 rules | Callbacks, timing, async |
| 6. Accessibility | 3 rules | ARIA, focus, forms |
| 7. Performance | 4 rules | Updates, caching, lazy loading |

## Priority Levels

| Priority | Description | Action |
|----------|-------------|--------|
| **CRITICAL** | Major correctness or accessibility issues | Fix immediately |
| **HIGH** | Significant maintainability/performance impact | Address in current PR |
| **MEDIUM** | Best practice violations | Address when touching related code |
| **LOW** | Style preferences, micro-optimizations | Consider during refactoring |

## Rules Index

### 1. Component Structure
- `rules/1-1-use-decorators.md` - Use TypeScript Decorators (HIGH)
- `rules/1-2-separate-state.md` - Separate Public Properties from Internal State (HIGH)
- `rules/1-3-reflect-sparingly.md` - Reflect Properties Sparingly (MEDIUM)
- `rules/1-4-default-values.md` - Always Provide Default Values (HIGH)

### 2. Rendering
- `rules/2-1-pure-render.md` - Keep render() Pure (CRITICAL)
- `rules/2-2-use-nothing.md` - Use nothing for Empty Content (MEDIUM)
- `rules/2-3-use-repeat.md` - Use repeat() for Keyed Lists (HIGH)
- `rules/2-4-use-cache.md` - Use cache() for Conditional Subtrees (MEDIUM)
- `rules/2-5-derived-state.md` - Compute Derived State in willUpdate() (HIGH)

### 3. Styling
- `rules/3-1-static-styles.md` - Always Use Static Styles (CRITICAL)
- `rules/3-2-host-styling.md` - Style the Host Element Properly (HIGH)
- `rules/3-3-css-custom-properties.md` - CSS Custom Properties for Theming (MEDIUM)
- `rules/3-4-css-parts.md` - CSS Parts for Deep Styling (MEDIUM)

### 4. Events
- `rules/4-1-composed-events.md` - Dispatch Composed Events (CRITICAL)
- `rules/4-2-event-naming.md` - Event Naming Conventions (MEDIUM)
- `rules/4-3-cleanup-listeners.md` - Clean Up Event Listeners (HIGH)

### 5. Lifecycle
- `rules/5-1-super-call-order.md` - Correct super() Call Order (CRITICAL)
- `rules/5-2-first-updated.md` - Use firstUpdated for DOM Operations (HIGH)
- `rules/5-3-will-update.md` - Use willUpdate for Derived State (HIGH)
- `rules/5-4-update-complete.md` - Async Operations with updateComplete (MEDIUM)

### 6. Accessibility
- `rules/6-1-delegates-focus.md` - delegatesFocus for Interactive Components (HIGH)
- `rules/6-2-aria-attributes.md` - ARIA for Custom Interactive Components (CRITICAL)
- `rules/6-3-form-associated.md` - Form-Associated Custom Elements (HIGH)

### 7. Performance
- `rules/7-1-has-changed.md` - Custom hasChanged for Complex Types (HIGH)
- `rules/7-2-batch-updates.md` - Batch Property Updates (MEDIUM)
- `rules/7-3-lazy-loading.md` - Lazy Load Heavy Dependencies (HIGH)
- `rules/7-4-memoization.md` - Memoize Expensive Computations (MEDIUM)

## Quick Reference

### Essential Imports

```typescript
// Core
import { LitElement, html, css, nothing } from ''lit'';
import { customElement, property, state, query } from ''lit/decorators.js'';

// Common Directives
import { repeat } from ''lit/directives/repeat.js'';
import { cache } from ''lit/directives/cache.js'';
import { classMap } from ''lit/directives/class-map.js'';
import { until } from ''lit/directives/until.js'';
```

### Component Skeleton

```typescript
@customElement(''my-component'')
export class MyComponent extends LitElement {
  static styles = css`
    :host { display: block; }
    :host([hidden]) { display: none; }
  `;

  @property({ type: String }) value = '''';
  @property({ type: Boolean, reflect: true }) disabled = false;
  @state() private _internal = '''';

  render() {
    return html`<slot></slot>`;
  }
}
```

## Resources

- [Lit Documentation](https://lit.dev/docs/)
- [Open Web Components](https://open-wc.org/)
- [Lion Web Components](https://github.com/ing-bank/lion)
- [web.dev Custom Elements Best Practices](https://web.dev/articles/custom-elements-best-practices)
' WHERE slug = 'neversight-lit-best-practices';