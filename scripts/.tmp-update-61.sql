UPDATE skills SET content = '---
name: near-connect-hooks
description: React hooks for NEAR Protocol wallet integration using @hot-labs/near-connect. Use when building React/Next.js apps that need NEAR wallet connection, smart contract calls (view and change methods), token transfers, access key management, or NEP-413 message signing. Triggers on queries about NEAR wallet hooks, NearProvider setup, useNearWallet hook, or NEAR dApp React integration.
---

# near-connect-hooks

React hooks library for NEAR wallet integration built on `@hot-labs/near-connect`.

## Installation

```bash
npm install near-connect-hooks @hot-labs/near-connect near-api-js
```

## Quick Start

### 1. Wrap App with NearProvider

```tsx
import { NearProvider } from ''near-connect-hooks'';

function App() {
  return (
    <NearProvider config={{ network: ''mainnet'' }}>
      <YourApp />
    </NearProvider>
  );
}
```

### 2. Use the Hook

```tsx
import { useNearWallet } from ''near-connect-hooks'';

function WalletButton() {
  const { signedAccountId, loading, signIn, signOut } = useNearWallet();
  
  if (loading) return <div>Loading...</div>;
  if (!signedAccountId) return <button onClick={signIn}>Connect</button>;
  return <button onClick={signOut}>Disconnect {signedAccountId}</button>;
}
```

## Core API

### Hook Properties

| Property | Type | Description |
|----------|------|-------------|
| `signedAccountId` | `string` | Connected account ID or empty string |
| `loading` | `boolean` | Initialization state |
| `network` | `"mainnet" \| "testnet"` | Current network |
| `provider` | `JsonRpcProvider` | Direct RPC provider access |
| `connector` | `NearConnector` | Direct connector access |

### Authentication

```tsx
const { signIn, signOut } = useNearWallet();

await signIn();   // Opens wallet selector
await signOut();  // Disconnects wallet
```

### View Functions (Read-Only)

```tsx
const { viewFunction } = useNearWallet();

const result = await viewFunction({
  contractId: ''contract.near'',
  method: ''get_data'',
  args: { key: ''value'' }  // optional
});
```

### Call Functions (State Changes)

```tsx
const { callFunction } = useNearWallet();

await callFunction({
  contractId: ''contract.near'',
  method: ''set_data'',
  args: { key: ''value'' },
  gas: ''30000000000000'',      // optional, default: 30 TGas
  deposit: ''1000000000000000000000000''  // optional, 1 NEAR in yoctoNEAR
});
```

### Transfers

```tsx
const { transfer } = useNearWallet();

await transfer({
  receiverId: ''recipient.near'',
  amount: ''1000000000000000000000000''  // 1 NEAR in yoctoNEAR
});
```

### Account Info

```tsx
const { getBalance, getAccessKeyList, signedAccountId } = useNearWallet();

const balance = await getBalance(signedAccountId);  // bigint in yoctoNEAR
const keys = await getAccessKeyList(signedAccountId);  // AccessKeyList
```

### NEP-413 Message Signing

```tsx
const { signNEP413Message } = useNearWallet();

const signed = await signNEP413Message({
  message: ''Verify ownership'',
  recipient: ''app.near'',
  nonce: crypto.getRandomValues(new Uint8Array(32))
});
```

### Access Key Management

```tsx
const { addFunctionCallKey, deleteKey } = useNearWallet();

// Add function call key
await addFunctionCallKey({
  publicKey: ''ed25519:...'',
  contractId: ''contract.near'',
  methodNames: [''method1'', ''method2''],  // empty = all methods
  allowance: ''250000000000000000000000''  // optional
});

// Delete key
await deleteKey({ publicKey: ''ed25519:...'' });
```

## Advanced Usage

### Low-Level Transactions

```tsx
import { useNearWallet, Actions } from ''near-connect-hooks'';

const { signAndSendTransaction, signAndSendTransactions } = useNearWallet();

// Single transaction with multiple actions
await signAndSendTransaction({
  receiverId: ''contract.near'',
  actions: [
    Actions.functionCall(''method'', { arg: ''value'' }, ''30000000000000'', ''0''),
    Actions.transfer(''1000000000000000000000000'')
  ]
});

// Multiple transactions
await signAndSendTransactions([
  { receiverId: ''contract1.near'', actions: [Actions.transfer(''1000'')] },
  { receiverId: ''contract2.near'', actions: [Actions.functionCall(''m'', {}, ''30000000000000'', ''0'')] }
]);
```

### Action Builders

```tsx
import { Actions } from ''near-connect-hooks'';

Actions.transfer(amount)
Actions.functionCall(methodName, args, gas, deposit)
Actions.addFullAccessKey(publicKey)
Actions.addFunctionCallKey(publicKey, receiverId, methodNames, allowance)
Actions.deleteKey(publicKey)
```

## Provider Configuration

```tsx
<NearProvider config={{
  network: ''mainnet'',  // ''testnet'' | ''mainnet''
  providers: {
    mainnet: [''https://free.rpc.fastnear.com''],
    testnet: [''https://test.rpc.fastnear.com'']
  }
}}>
```

## Reference Files

- [API Reference](references/api-reference.md) - Full type definitions and method signatures
- [Examples](references/examples.md) - Complete integration examples
' WHERE slug = 'neversight-near-connect-hooks';
UPDATE skills SET content = '---
name: angular-19
description: >
    Angular 19 patterns: signals, standalone components, resource API, signal
    queries, dependency injection, and Aurora framework integration. Trigger:
    When implementing Angular components, directives, pipes, services, or using
    modern reactive patterns.
license: MIT
metadata:
    author: aurora
    version: ''3.0''
    angular_version: ''19.x''
    auto_invoke:
        ''Angular components, signals, resource API, dependency injection,
        standalone, directives, pipes''
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, WebFetch, WebSearch, Task
---

## When to Use

- Implementing Angular components (detail, list, dialog)
- Working with signals, resources, and reactive patterns
- Creating custom pipes or directives
- Setting up dependency injection
- Configuring change detection strategies

**Reference files** (loaded on demand):

- [signals-api.md](signals-api.md) — Signals, inputs, outputs, model, linkedSignal, signal queries
- [resource-api.md](resource-api.md) — resource(), rxResource(), httpResource()
- [template-syntax.md](template-syntax.md) — @let, @if/@for/@switch, @defer, hydration

---

## Angular 19 Key Changes

### Standalone by Default (BREAKING)

All components, directives, and pipes are standalone by default. No `standalone: true` needed.

```typescript
// ✅ Angular 19: standalone is implicit
@Component({
    selector: ''app-example'',
    templateUrl: ''./example.component.html'',
    imports: [CommonModule, MatButtonModule],
})
export class ExampleComponent {}

// ❌ Only if you NEED NgModule (legacy)
@Component({ selector: ''app-legacy'', standalone: false })
export class LegacyComponent {}
```

---

## Signals (Stable in v19) — Quick Reference

```typescript
import { signal, computed, effect } from ''@angular/core'';

count = signal(0);                                    // Writable
doubleCount = computed(() => this.count() * 2);       // Derived read-only

this.count.set(5);           // Replace
this.count.update(n => n + 1); // Update
const val = this.count();    // Read

// Effect — can set signals directly in v19 (no allowSignalWrites needed)
effect(() => {
    console.log(''Count:'', this.count());
    this.logCount.set(this.count()); // ✅ allowed in v19
});
```

For full signal API (inputs, outputs, model, linkedSignal, queries) → see [signals-api.md](signals-api.md)

---

## Dependency Injection (Modern)

```typescript
export class MyComponent {
    // ✅ Preferred: inject() function
    private readonly http = inject(HttpClient);
    private readonly router = inject(Router);
    private readonly logger = inject(LoggerService, { optional: true });
    private readonly config = inject(CONFIG_TOKEN, { self: true });
}

// Tree-shakable singleton
@Injectable({ providedIn: ''root'' })
export class UserService {}

// ✅ New in v19: provideAppInitializer
providers: [
    provideAppInitializer(() => {
        const config = inject(ConfigService);
        return config.load();
    }),
]
```

---

## RxJS Interop

```typescript
import { toSignal, toObservable } from ''@angular/core/rxjs-interop'';
import { takeUntilDestroyed } from ''@angular/core/rxjs-interop'';

// Observable → Signal (with custom equality in v19)
arraySignal = toSignal(this.array$, {
    initialValue: [],
    equal: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
});

// Signal → Observable
count$ = toObservable(this.count);

// Auto-unsubscribe on destroy
this.data$.pipe(takeUntilDestroyed()).subscribe(data => { /* ... */ });
```

---

## Lifecycle & Rendering (v19)

```typescript
import { afterRenderEffect, afterRender, afterNextRender } from ''@angular/core'';

// afterRenderEffect — tracks dependencies, reruns when they change
afterRenderEffect(() => {
    const el = this.chartEl().nativeElement;
    this.renderChart(el, this.data());
});

// afterRender — every render cycle
afterRender(() => this.updateScrollPosition());

// afterNextRender — once after next render
afterNextRender(() => this.initializeThirdPartyLib());
```

---

## Pipes & Directives

```typescript
// Pure Pipe (default)
@Pipe({ name: ''dateFormat'' })
export class DateFormatPipe implements PipeTransform {
    transform(timestamp: string, format: string): string {
        return dateFromFormat(timestamp, ''YYYY-MM-DD HH:mm:ss'').format(format);
    }
}

// Attribute Directive with signal input
@Directive({ selector: ''[auFocus]'' })
export class FocusDirective {
    private readonly elementRef = inject(ElementRef<HTMLElement>);
    focused = input(true, { alias: ''auFocus'', transform: booleanAttribute });

    constructor() {
        effect(() => {
            if (this.focused()) this.elementRef.nativeElement.focus();
        });
    }
}
```

---

## Anti-Patterns

| Avoid                                 | Do Instead                             |
| ------------------------------------- | -------------------------------------- |
| `standalone: true` (redundant in v19) | Omit (standalone by default)           |
| `@Input()` decorator                  | `input()` / `input.required()`         |
| `@Output()` decorator                 | `output()`                             |
| `@ViewChild()` decorator              | `viewChild()` / `viewChild.required()` |
| `allowSignalWrites` in effect         | Not needed in v19                      |
| Manual subscription cleanup           | `takeUntilDestroyed()`                 |
| `ChangeDetectionStrategy.Default`     | Use `OnPush` with signals              |
| `ngOnInit` for async data             | `resource()` / `rxResource()`          |
| Constructor injection (verbose)       | `inject()` function                    |
| `APP_INITIALIZER` token               | `provideAppInitializer()`              |

---

## Related Skills

| Skill              | When to Use Together                       |
| ------------------ | ------------------------------------------ |
| `angular-material` | Material components, CDK, theming          |
| `tailwind`         | Styling with Tailwind CSS                  |
| `typescript`       | TypeScript patterns, generics, type safety |
| `aurora-schema`    | When working with Aurora YAML schemas      |

---

## Resources

- [Angular 19 Official Blog](https://blog.angular.dev/meet-angular-v19-7b29dfd05b84)
- [Angular Signals Guide](https://angular.dev/guide/signals)
- [Resource API Guide](https://angular.dev/guide/signals/resource)
' WHERE slug = 'neversight-angular-19';
UPDATE skills SET content = '---
name: react-native-animations
description: Master animations - Reanimated 3, Gesture Handler, layout animations, and performance optimization
sasmp_version: "1.3.0"
bonded_agent: 05-react-native-animation
bond_type: PRIMARY_BOND
version: "2.0.0"
updated: "2025-01"
---

# React Native Animations Skill

> Learn high-performance animations using Reanimated 3, Gesture Handler, and layout animations.

## Prerequisites

- React Native basics
- Understanding of JavaScript closures
- Familiarity with transforms and styles

## Learning Objectives

After completing this skill, you will be able to:
- [ ] Create smooth 60fps animations with Reanimated
- [ ] Handle complex gestures with Gesture Handler
- [ ] Implement layout entering/exiting animations
- [ ] Optimize animations for performance
- [ ] Combine gestures with animations

---

## Topics Covered

### 1. Installation
```bash
npm install react-native-reanimated react-native-gesture-handler

# babel.config.js
module.exports = {
  plugins: [''react-native-reanimated/plugin''],
};
```

### 2. Reanimated Basics
```tsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from ''react-native-reanimated'';

function AnimatedBox() {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(scale.value === 1 ? 1.5 : 1);
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[styles.box, animatedStyle]} />
    </Pressable>
  );
}
```

### 3. Gesture Handler
```tsx
import { Gesture, GestureDetector } from ''react-native-gesture-handler'';

function DraggableBox() {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd(() => {
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.box, style]} />
    </GestureDetector>
  );
}
```

### 4. Layout Animations
```tsx
import Animated, { FadeIn, FadeOut, Layout } from ''react-native-reanimated'';

function AnimatedList({ items }) {
  return (
    <Animated.View layout={Layout.springify()}>
      {items.map((item) => (
        <Animated.View
          key={item.id}
          entering={FadeIn}
          exiting={FadeOut}
          layout={Layout.springify()}
        >
          <Text>{item.title}</Text>
        </Animated.View>
      ))}
    </Animated.View>
  );
}
```

### 5. Animation Timing

| Function | Use Case |
|----------|----------|
| withTiming | Linear, controlled duration |
| withSpring | Natural, physics-based |
| withDecay | Momentum-based (fling) |
| withSequence | Multiple animations in order |
| withRepeat | Looping animations |

---

## Quick Start Example

```tsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from ''react-native-reanimated'';
import { Gesture, GestureDetector } from ''react-native-gesture-handler'';

function SwipeCard() {
  const translateX = useSharedValue(0);

  const gesture = Gesture.Pan()
    .onUpdate((e) => { translateX.value = e.translationX; })
    .onEnd(() => { translateX.value = withSpring(0); });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${interpolate(translateX.value, [-200, 200], [-15, 15])}deg` },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.card, style]} />
    </GestureDetector>
  );
}
```

---

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Attempted to call from worklet" | Missing runOnJS | Wrap with `runOnJS()` |
| Animation not running | Missing ''worklet'' | Add ''worklet'' directive |
| Gesture not working | Missing root view | Add GestureHandlerRootView |

---

## Validation Checklist

- [ ] Animations run at 60fps
- [ ] Gestures respond smoothly
- [ ] No frame drops on low-end devices
- [ ] Layout animations don''t cause jank

---

## Usage

```
Skill("react-native-animations")
```

**Bonded Agent**: `05-react-native-animation`
' WHERE slug = 'neversight-react-native-animations';
UPDATE skills SET content = '---
name: ai-sdk-v6
description: Guide for building AI-powered applications using the Vercel AI SDK v6. Use when developing with generateText, streamText, useChat, tool calling, agents, structured output generation, MCP integration, or any LLM-powered features in TypeScript/JavaScript applications. Covers React, Next.js, Vue, Svelte, and Node.js implementations.
---

# AI SDK v6

## Overview

The AI SDK is the TypeScript toolkit for building AI-powered applications with React, Next.js, Vue, Svelte, Node.js, and more. It provides a unified API across multiple model providers (OpenAI, Anthropic, Google, etc.) and consists of:

- **AI SDK Core**: Unified API for text generation, structured data, tool calling, and agents
- **AI SDK UI**: Framework-agnostic hooks (`useChat`, `useCompletion`, `useObject`) for chat interfaces

## Quick Start

### Installation

```bash
npm install ai @ai-sdk/openai  # or @ai-sdk/anthropic, @ai-sdk/google, etc.
```

### Basic Text Generation

```typescript
import { generateText } from ''ai'';

const { text } = await generateText({
  model: ''anthropic/claude-sonnet-4.5'', // or use provider-specific: anthropic(''claude-sonnet-4.5'')
  prompt: ''Write a haiku about programming.'',
});
```

### Streaming Text

```typescript
import { streamText } from ''ai'';

const result = streamText({
  model: ''anthropic/claude-sonnet-4.5'',
  prompt: ''Explain quantum computing.'',
});

for await (const text of result.textStream) {
  process.stdout.write(text);
}
```

## Provider Configuration

### Using Provider Functions

```typescript
import { anthropic } from ''@ai-sdk/anthropic'';
import { openai } from ''@ai-sdk/openai'';
import { google } from ''@ai-sdk/google'';

// Provider-specific model initialization
const result = await generateText({
  model: anthropic(''claude-sonnet-4.5''),
  prompt: ''Hello!'',
});
```

### Using Gateway Strings

```typescript
// Simpler string-based model references
const result = await generateText({
  model: ''anthropic/claude-sonnet-4.5'',
  prompt: ''Hello!'',
});
```

## Tool Calling

Define tools with schemas and execute functions:

```typescript
import { generateText, tool, stepCountIs } from ''ai'';
import { z } from ''zod'';

const result = await generateText({
  model: ''anthropic/claude-sonnet-4.5'',
  tools: {
    weather: tool({
      description: ''Get the weather in a location'',
      inputSchema: z.object({
        location: z.string().describe(''City name''),
      }),
      execute: async ({ location }) => ({
        location,
        temperature: 72,
        condition: ''sunny'',
      }),
    }),
  },
  stopWhen: stepCountIs(5), // Enable multi-step tool execution
  prompt: ''What is the weather in San Francisco?'',
});
```

### Tool Execution Approval (Human-in-the-Loop)

```typescript
const runCommand = tool({
  description: ''Run a shell command'',
  inputSchema: z.object({
    command: z.string(),
  }),
  needsApproval: true, // Require user approval before execution
  execute: async ({ command }) => {
    // execution logic
  },
});
```

## Agents (New in v6)

### ToolLoopAgent

Production-ready agent abstraction that handles the complete tool execution loop:

```typescript
import { ToolLoopAgent } from ''ai'';

const weatherAgent = new ToolLoopAgent({
  model: ''anthropic/claude-sonnet-4.5'',
  instructions: ''You are a helpful weather assistant.'',
  tools: {
    weather: weatherTool,
  },
});

const result = await weatherAgent.generate({
  prompt: ''What is the weather in San Francisco?'',
});
```

### Agent with Structured Output

```typescript
import { ToolLoopAgent, Output } from ''ai'';

const agent = new ToolLoopAgent({
  model: ''anthropic/claude-sonnet-4.5'',
  tools: { weather: weatherTool },
  output: Output.object({
    schema: z.object({
      summary: z.string(),
      temperature: z.number(),
    }),
  }),
});
```

## Structured Data Generation

```typescript
import { generateObject, Output } from ''ai'';
import { z } from ''zod'';

const { object } = await generateObject({
  model: ''anthropic/claude-sonnet-4.5'',
  schema: z.object({
    recipe: z.object({
      name: z.string(),
      ingredients: z.array(z.object({
        name: z.string(),
        amount: z.string(),
      })),
      steps: z.array(z.string()),
    }),
  }),
  prompt: ''Generate a lasagna recipe.'',
});
```

## UI Integration (React/Next.js)

### useChat Hook

```typescript
''use client'';

import { useChat } from ''@ai-sdk/react'';
import { DefaultChatTransport } from ''ai'';

export default function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: ''/api/chat'',
    }),
  });

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>
          {message.role}: {message.parts.map((part, i) => 
            part.type === ''text'' ? <span key={i}>{part.text}</span> : null
          )}
        </div>
      ))}
      <form onSubmit={e => {
        e.preventDefault();
        sendMessage({ text: input });
      }}>
        <input value={input} onChange={e => setInput(e.target.value)} />
        <button type="submit" disabled={status !== ''ready''}>Send</button>
      </form>
    </div>
  );
}
```

### API Route (Next.js App Router)

```typescript
// app/api/chat/route.ts
import { convertToModelMessages, streamText, UIMessage } from ''ai'';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: ''anthropic/claude-sonnet-4.5'',
    system: ''You are a helpful assistant.'',
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

## MCP (Model Context Protocol) Integration

```typescript
import { createMCPClient } from ''@ai-sdk/mcp'';

const mcpClient = await createMCPClient({
  transport: {
    type: ''http'',
    url: ''https://your-server.com/mcp'',
    headers: { Authorization: ''Bearer my-api-key'' },
  },
});

const tools = await mcpClient.tools();

// Use MCP tools with generateText/streamText
const result = await generateText({
  model: ''anthropic/claude-sonnet-4.5'',
  tools,
  prompt: ''Use the available tools to help me.'',
});
```

## DevTools

Debug AI applications with full visibility into LLM calls:

```typescript
import { wrapLanguageModel, gateway } from ''ai'';
import { devToolsMiddleware } from ''@ai-sdk/devtools'';

const model = wrapLanguageModel({
  model: gateway(''anthropic/claude-sonnet-4.5''),
  middleware: devToolsMiddleware(),
});

// Launch viewer: npx @ai-sdk/devtools
// Open http://localhost:4983
```

## Resources

For detailed API documentation, see:

- [references/core-api.md](references/core-api.md) - Complete AI SDK Core API (generateText, streamText, generateObject, tool definitions)
- [references/ui-hooks.md](references/ui-hooks.md) - AI SDK UI hooks (useChat, useCompletion, useObject) and transport configuration
- [references/agents.md](references/agents.md) - Agent abstractions (ToolLoopAgent), workflow patterns, and loop control
' WHERE slug = 'neversight-ai-sdk-v6';
UPDATE skills SET content = '---
name: spa-reverse-engineer
description: Reverse engineer Single Page Applications built with React + Vite + Workbox — analyze SPA internals via Chrome DevTools Protocol (CDP), write browser extensions, intercept service workers, and extract runtime state for SDK integration.
context: fork
agent: spa-expert
---

# SPA Reverse Engineering — React + Vite + Workbox + CDP

Reverse engineer modern SPAs to extract APIs, intercept service workers, debug runtime state, and build tooling.

## When to use

Use this skill when:
- Analyzing perplexity.ai SPA internals (React component tree, state, hooks)
- Intercepting Workbox service worker caching and request strategies
- Using Chrome DevTools Protocol (CDP) to automate browser interactions
- Building Chrome extensions for traffic interception or state extraction
- Debugging Vite-bundled source maps and module graph
- Extracting GraphQL/REST schemas from SPA network layer
- Writing Puppeteer/Playwright scripts for automated API discovery

## Instructions

### Step 1: Identify SPA Stack

Detect the technology stack of the target SPA:

```javascript
// In DevTools Console:

// React detection
window.__REACT_DEVTOOLS_GLOBAL_HOOK__  // React DevTools presence
document.querySelector(''#__next'')  // Next.js
document.querySelector(''#root'')    // Vite/CRA
document.querySelector(''#app'')     // Vue (for comparison)

// Vite detection
document.querySelector(''script[type="module"]'')  // ESM modules
// Check source for /@vite/client or /.vite/ paths

// Workbox / Service Worker
navigator.serviceWorker.getRegistrations()  // List SWs
// Check Application → Service Workers in DevTools

// State management
window.__REDUX_DEVTOOLS_EXTENSION__  // Redux
// React DevTools → Components → hooks for Zustand/Jotai/Recoil
```

### Step 2: React Internals Analysis

#### Component Tree Extraction

```javascript
// Get React fiber tree from any DOM element
function getFiber(element) {
    const key = Object.keys(element).find(k =>
        k.startsWith(''__reactFiber$'') || k.startsWith(''__reactInternalInstance$'')
    );
    return element[key];
}

// Walk fiber tree
function walkFiber(fiber, depth = 0) {
    if (!fiber) return;
    const name = fiber.type?.displayName || fiber.type?.name || fiber.type;
    if (typeof name === ''string'') {
        console.log(''  ''.repeat(depth) + name);
    }
    walkFiber(fiber.child, depth + 1);
    walkFiber(fiber.sibling, depth);
}

// Start from root
const root = document.getElementById(''root'');
walkFiber(getFiber(root));
```

#### State & Props Extraction

```javascript
// Extract component state via fiber
function getComponentState(fiber) {
    const state = [];
    let hook = fiber.memoizedState;
    while (hook) {
        state.push(hook.memoizedState);
        hook = hook.next;
    }
    return state;
}

// Find specific component by name
function findComponent(fiber, name) {
    if (!fiber) return null;
    if (fiber.type?.name === name || fiber.type?.displayName === name) {
        return fiber;
    }
    return findComponent(fiber.child, name) || findComponent(fiber.sibling, name);
}
```

### Step 3: Vite Bundle Analysis

#### Source Map Extraction

```bash
# Find source maps from bundled assets
curl -s https://www.perplexity.ai/ | grep -oP ''src="[^"]*\.js"'' | while read src; do
    url=$(echo $src | grep -oP ''"[^"]*"'' | tr -d ''"'')
    echo "Checking: $url"
    curl -sI "https://www.perplexity.ai${url}.map" | head -5
done
```

#### Module Graph

```javascript
// In Vite dev mode (if accessible):
// /__vite_module_graph shows dependency graph

// In production — analyze chunks:
// Performance → Network → JS files → Initiator chain
// Sources → Webpack/Vite tree → module paths
```

### Step 4: Service Worker & Workbox Interception

#### Analyze Caching Strategy

```javascript
// List all cached URLs
async function listCaches() {
    const names = await caches.keys();
    for (const name of names) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        console.log(`Cache: ${name} (${keys.length} entries)`);
        keys.forEach(k => console.log(`  ${k.url}`));
    }
}

// Intercept SW fetch events (from SW scope)
self.addEventListener(''fetch'', event => {
    console.log(''[SW Intercept]'', event.request.method, event.request.url);
});
```

#### Workbox Strategy Detection

```javascript
// Common Workbox strategies to look for in SW source:
// - CacheFirst       → Static assets (fonts, images)
// - NetworkFirst     → API calls (dynamic data)
// - StaleWhileRevalidate → Frequently updated content
// - NetworkOnly      → Always fresh (auth endpoints)
// - CacheOnly        → Offline-only content

// Check SW source for workbox patterns:
// workbox.strategies.CacheFirst
// workbox.routing.registerRoute
// workbox.precaching.precacheAndRoute
```

### Step 5: Chrome DevTools Protocol (CDP)

#### Automated Interception via CDP

```python
import asyncio
from playwright.async_api import async_playwright

async def intercept_with_cdp():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()

        # Enable CDP domains
        cdp = await page.context.new_cdp_session(page)

        # Intercept network at CDP level
        await cdp.send(''Network.enable'')
        cdp.on(''Network.requestWillBeSent'', lambda params:
            print(f"[CDP] {params[''request''][''method'']} {params[''request''][''url'']}")
        )
        cdp.on(''Network.responseReceived'', lambda params:
            print(f"[CDP] {params[''response''][''status'']} {params[''response''][''url'']}")
        )

        # Intercept WebSocket frames
        await cdp.send(''Network.enable'')
        cdp.on(''Network.webSocketFrameSent'', lambda params:
            print(f"[WS→] {params[''response''][''payloadData''][:200]}")
        )
        cdp.on(''Network.webSocketFrameReceived'', lambda params:
            print(f"[←WS] {params[''response''][''payloadData''][:200]}")
        )

        await page.goto(''https://www.perplexity.ai/'')
        await page.wait_for_timeout(60000)
```

#### Runtime JS Evaluation via CDP

```python
# Execute JS in page context
result = await cdp.send(''Runtime.evaluate'', {
    ''expression'': ''JSON.stringify(window.__NEXT_DATA__)'',
    ''returnByValue'': True,
})
next_data = json.loads(result[''result''][''value''])
```

### Step 6: Chrome Extension Development

#### Manifest v3 Extension for Traffic Capture

```json
{
    "manifest_version": 3,
    "name": "pplx-sdk Traffic Capture",
    "version": "1.0",
    "permissions": [
        "webRequest", "activeTab", "storage", "debugger"
    ],
    "host_permissions": ["https://www.perplexity.ai/*"],
    "background": {
        "service_worker": "background.js"
    },
    "content_scripts": [{
        "matches": ["https://www.perplexity.ai/*"],
        "js": ["content.js"],
        "run_at": "document_start"
    }]
}
```

#### Background Script — Request Interception

```javascript
// background.js
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (details.url.includes(''/rest/'')) {
            console.log(''[pplx-capture]'', details.method, details.url);
            if (details.requestBody?.raw) {
                const body = new TextDecoder().decode(
                    new Uint8Array(details.requestBody.raw[0].bytes)
                );
                chrome.storage.local.set({
                    [`req_${Date.now()}`]: {
                        url: details.url,
                        method: details.method,
                        body: JSON.parse(body),
                        timestamp: Date.now()
                    }
                });
            }
        }
    },
    { urls: ["https://www.perplexity.ai/rest/*"] },
    ["requestBody"]
);
```

#### Content Script — React State Extraction

```javascript
// content.js — inject into page context
const script = document.createElement(''script'');
script.textContent = `
    // Hook into React state updates
    const origSetState = React.Component.prototype.setState;
    React.Component.prototype.setState = function(state, cb) {
        window.postMessage({
            type: ''PPLX_STATE_UPDATE'',
            component: this.constructor.name,
            state: JSON.parse(JSON.stringify(state))
        }, ''*'');
        return origSetState.call(this, state, cb);
    };
`;
document.documentElement.appendChild(script);

// Listen for state updates
window.addEventListener(''message'', (event) => {
    if (event.data.type === ''PPLX_STATE_UPDATE'') {
        chrome.runtime.sendMessage(event.data);
    }
});
```

### Step 7: Map Discoveries to SDK

| SPA Discovery | SDK Target | Action |
|--------------|-----------|--------|
| React component state | `domain/models.py` | Model the state shape |
| API fetch calls | `transport/http.py` | Add endpoint methods |
| SSE event handlers | `transport/sse.py` | Map event types |
| Service worker cache | `shared/` | Understand caching behavior |
| Auth token flow | `shared/auth.py` | Token refresh logic |
| WebSocket frames | `transport/` | New WebSocket transport |
| GraphQL queries | `domain/` | Query/mutation services |

### Step 8: SPA Source Code Graph

After runtime analysis, build a **static code graph** of the SPA source. Delegate to `codegraph` for structural analysis.

#### Source Map Recovery

```bash
# Extract original source paths from source maps
curl -s https://www.perplexity.ai/ | grep -oP ''src="(/[^"]*\.js)"'' | while read -r url; do
    echo "Checking: $url"
    curl -s "https://www.perplexity.ai${url}.map" 2>/dev/null | \
        python3 -c "import sys,json; d=json.load(sys.stdin); print(''\n''.join(d.get(''sources'',[])))" 2>/dev/null
done | sort -u
```

#### Static Analysis (from recovered source or public repo)

```bash
# Component tree from source
grep -rn "export \(default \)\?function \|export const .* = (" src/ --include="*.tsx" --include="*.jsx"

# Import graph
grep -rn "import .* from " src/ --include="*.ts" --include="*.tsx" | \
    awk -F: ''{print $1 " → " $NF}'' | sort -u

# Hook usage map
grep -rn "use[A-Z][a-zA-Z]*(" src/ --include="*.tsx" | \
    grep -oP ''use[A-Z][a-zA-Z]*'' | sort | uniq -c | sort -rn

# API call sites (fetch, axios, etc.)
grep -rn "fetch(\|axios\.\|api\.\|apiClient\." src/ --include="*.ts" --include="*.tsx"
```

#### Cross-Reference: Runtime ↔ Static

| Runtime Discovery (spa-expert) | Static Discovery (codegraph) | Cross-Reference |
|-------------------------------|------------------------------|-----------------|
| Fiber tree component names | Source component definitions | Match names to source files |
| Hook state values | Hook implementations | Map state shape to hook logic |
| Network API calls | `fetch()`/`axios` call sites | Confirm endpoints in source |
| Context provider values | `createContext()` definitions | Map runtime state to types |
| Service worker routes | Workbox config in source | Validate caching strategy |

## Perplexity.ai SPA Notes

### Known Stack
- **Framework**: Next.js (React 18+)
- **Bundler**: Webpack (via Next.js, not raw Vite — skill covers both for broader SPA RE)
- **State**: React hooks + context (observed patterns)
- **Streaming**: SSE via fetch() with ReadableStream
- **Auth**: Cookie-based (`pplx.session-id`)

### Key DOM Selectors
```javascript
// Query input
document.querySelector(''textarea[placeholder*="Ask"]'')
// Response area
document.querySelector(''[class*="prose"]'')
// Thread list
document.querySelector(''[class*="thread"]'')
```
' WHERE slug = 'neversight-spa-reverse-engineer';
UPDATE skills SET content = '---
name: velt-setup-best-practices
description: Velt collaboration SDK setup guide for React, Next.js, Angular, Vue, and HTML applications. Use this skill when setting up Velt for the first time, configuring VeltProvider, implementing user authentication, or initializing document collaboration.
license: MIT
metadata:
  author: velt
  version: "1.0.0"
---

# Velt Setup Best Practices

Comprehensive setup guide for Velt collaboration SDK. Contains 21 rules across 8 categories covering installation, authentication, document setup, and project organization.

## When to Apply

Reference these guidelines when:
- Setting up Velt in a new React, Next.js, Angular, Vue, or HTML project
- Configuring VeltProvider and API keys
- Implementing user authentication with Velt (userId, organizationId)
- Setting up JWT token generation for production
- Initializing documents with documentId
- Organizing Velt-related files in your project

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Installation | CRITICAL | `install-` |
| 2 | Provider Wiring | CRITICAL | `provider-` |
| 3 | Identity | CRITICAL | `identity-` |
| 4 | Document Identity | CRITICAL | `document-` |
| 5 | Config | HIGH | `config-` |
| 6 | Project Structure | MEDIUM | `structure-` |
| 7 | Routing Surfaces | MEDIUM | `surface-` |
| 8 | Debugging & Testing | LOW-MEDIUM | `debug-` |

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/react/installation/install-react-packages.md
rules/react/provider-wiring/provider-velt-provider-setup.md
rules/shared/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Verification checklist
- Source pointers to official docs

## Compiled Documents

- `AGENTS.md` — Compressed index of all rules with file paths (start here)
- `AGENTS.full.md` — Full verbose guide with all rules expanded inline
' WHERE slug = 'neversight-velt-setup-best-practices';
UPDATE skills SET content = '---
name: frontend-component
description: Create React/Vue component with TypeScript, tests, and styles. Auto-invoke when user says "create component", "add component", "new component", or "build component".
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
version: 1.0.0
---

# Frontend Component Generator

Generate production-ready React/Vue components with TypeScript, tests, and styles following modern best practices.

## When to Invoke

Auto-invoke when user mentions:
- "Create a component"
- "Add a component"
- "New component"
- "Build a component"
- "Generate component for [feature]"

## What This Does

1. Generates component file with TypeScript and props interface
2. Creates test file with React Testing Library
3. Generates CSS module for styling
4. Creates barrel export (index.ts)
5. Validates naming conventions
6. Follows project patterns

## Execution Steps

### Step 1: Gather Component Requirements

**Ask user for component details**:
```
Component name: [PascalCase name, e.g., UserProfile]
Component type:
  - simple (basic functional component)
  - with-hooks (useState, useEffect, etc.)
  - container (data fetching component)

Styling approach:
  - css-modules (default)
  - styled-components
  - tailwind

Props needed: [Optional: describe expected props]
```

**Validate component name**:
- Use predefined function: `functions/name_validator.py`
- Ensure PascalCase format
- No reserved words
- Descriptive and specific

### Step 1.5: Confirm Component Design (ToM Checkpoint) [EXECUTE]

**IMPORTANT**: This step MUST be executed for complex components.

**Before generating files, confirm interpretation with user**.

**Display verification**:
```
I understood you want:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Component: {NAME}
Type: {TYPE} (inferred because: {REASON})
Location: src/components/{NAME}/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Detected patterns from your codebase:
- Styling: {CSS_APPROACH} (found {EVIDENCE})
- Testing: {TEST_LIBRARY} (found in package.json)
- Similar component: {EXISTING_COMPONENT} at {PATH}

Props I''ll generate:
{PROPS_PREVIEW}

Proceed with generation? [Y/n]
```

**Skip verification if** (HIGH-STAKES ONLY mode):
- Simple presentational component (no hooks, no data fetching)
- User explicitly said "quick", "just do it", or "skip confirmation"
- Component name and type are unambiguous
- No complex props structure

**Always verify if**:
- Container component with data fetching
- Complex props interface (5+ props)
- Hooks component with side effects
- Component name similar to existing component
- User is new to codebase (no profile history)

### Step 2: Generate Props Interface

**Based on component type and requirements**:

Use predefined function: `functions/props_interface_generator.py`

```python
# Generates TypeScript interface based on component requirements
python3 functions/props_interface_generator.py \
  --name "UserProfile" \
  --props "userId:string,onUpdate:function,isActive:boolean"
```

**Output**:
```typescript
interface UserProfileProps {
  userId: string;
  onUpdate?: () => void;
  isActive?: boolean;
  children?: React.ReactNode;
  className?: string;
}
```

### Step 3: Generate Component File

**Use appropriate template based on type**:

**Simple component**:
```
Use template: templates/component-simple-template.tsx
```

**Component with hooks**:
```
Use template: templates/component-with-hooks-template.tsx
```

**Container component**:
```
Use template: templates/component-container-template.tsx
```

**Use predefined function**: `functions/component_generator.py`

```bash
python3 functions/component_generator.py \
  --name "UserProfile" \
  --type "simple" \
  --props-interface "UserProfileProps" \
  --template "templates/component-simple-template.tsx" \
  --output "src/components/UserProfile/UserProfile.tsx"
```

**Template substitutions**:
- `${COMPONENT_NAME}` → Component name (PascalCase)
- `${PROPS_INTERFACE}` → Generated props interface
- `${STYLE_IMPORT}` → CSS module import
- `${DESCRIPTION}` → Brief component description

### Step 4: Generate Test File

**Use predefined function**: `functions/test_generator.py`

```bash
python3 functions/test_generator.py \
  --component-name "UserProfile" \
  --component-path "src/components/UserProfile/UserProfile.tsx" \
  --template "templates/test-template.test.tsx" \
  --output "src/components/UserProfile/UserProfile.test.tsx"
```

**Test template includes**:
- Basic rendering test
- Props validation test
- Event handler tests (if applicable)
- Accessibility tests

**Template substitutions**:
- `${COMPONENT_NAME}` → Component name
- `${IMPORT_PATH}` → Relative import path
- `${TEST_CASES}` → Generated test cases based on props

### Step 5: Generate Style File

**Use predefined function**: `functions/style_generator.py`

```bash
python3 functions/style_generator.py \
  --name "UserProfile" \
  --approach "css-modules" \
  --template "templates/style-template.module.css" \
  --output "src/components/UserProfile/UserProfile.module.css"
```

**CSS Modules template**:
```css
.container {
  /* Component wrapper styles */
}

.title {
  /* Title styles */
}

/* Add more classes as needed */
```

**Styled Components alternative**:
```typescript
// Generated if --approach "styled-components"
import styled from ''styled-components'';

export const Container = styled.div`
  /* Component wrapper styles */
`;

export const Title = styled.h2`
  /* Title styles */
`;
```

### Step 6: Generate Barrel Export

**Create index.ts for clean imports**:

```bash
Write(
  file_path: "src/components/UserProfile/index.ts",
  content: "export { UserProfile } from ''./UserProfile'';\nexport type { UserProfileProps } from ''./UserProfile'';\n"
)
```

**Allows usage**:
```typescript
import { UserProfile } from ''@/components/UserProfile'';
```

### Step 7: Show Component Summary

**Display generated files and usage**:

```
✅ Component Created: UserProfile

Structure:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 src/components/UserProfile/
   ├── UserProfile.tsx         (Component)
   ├── UserProfile.test.tsx    (Tests)
   ├── UserProfile.module.css  (Styles)
   └── index.ts                (Exports)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Props Interface:
interface UserProfileProps {
  userId: string;
  onUpdate?: () => void;
  isActive?: boolean;
}

Usage:
import { UserProfile } from ''@/components/UserProfile'';

<UserProfile
  userId="123"
  onUpdate={() => console.log(''Updated'')}
  isActive={true}
/>

Next Steps:
1. Customize component implementation
2. Run tests: npm test UserProfile
3. Import and use in your feature
```

---

## Predefined Functions

### 1. name_validator.py

Validates component naming conventions.

**Usage**:
```bash
python3 functions/name_validator.py --name "UserProfile"
```

**Checks**:
- PascalCase format
- Not a reserved word (e.g., Component, Element, etc.)
- Descriptive (length > 2 chars)
- No special characters

**Returns**: Valid name or error message

---

### 2. props_interface_generator.py

Generates TypeScript props interface from user input.

**Usage**:
```bash
python3 functions/props_interface_generator.py \
  --name "UserProfile" \
  --props "userId:string,onUpdate:function,isActive:boolean"
```

**Supported types**:
- `string`, `number`, `boolean`
- `function` (becomes `() => void`)
- `array` (becomes `any[]`)
- `object` (becomes `Record<string, any>`)
- `react-node` (becomes `React.ReactNode`)

**Returns**: TypeScript interface string

---

### 3. component_generator.py

Generates component file from template with substitutions.

**Usage**:
```bash
python3 functions/component_generator.py \
  --name "UserProfile" \
  --type "simple" \
  --props-interface "UserProfileProps" \
  --template "templates/component-simple-template.tsx" \
  --output "src/components/UserProfile/UserProfile.tsx"
```

**Parameters**:
- `--name`: Component name (PascalCase)
- `--type`: Component type (simple/with-hooks/container)
- `--props-interface`: Props interface name
- `--template`: Template file path
- `--output`: Output file path

**Returns**: Generated component code

---

### 4. test_generator.py

Generates test file with React Testing Library.

**Usage**:
```bash
python3 functions/test_generator.py \
  --component-name "UserProfile" \
  --component-path "src/components/UserProfile/UserProfile.tsx" \
  --template "templates/test-template.test.tsx" \
  --output "src/components/UserProfile/UserProfile.test.tsx"
```

**Generates tests for**:
- Component rendering
- Props validation
- Event handlers
- Accessibility attributes

**Returns**: Generated test code

---

### 5. style_generator.py

Generates style file (CSS Modules or Styled Components).

**Usage**:
```bash
python3 functions/style_generator.py \
  --name "UserProfile" \
  --approach "css-modules" \
  --template "templates/style-template.module.css" \
  --output "src/components/UserProfile/UserProfile.module.css"
```

**Supported approaches**:
- `css-modules` (default)
- `styled-components`
- `tailwind` (generates className utilities)

**Returns**: Generated style code

---

## Templates

### component-simple-template.tsx

Basic functional component template.

**Placeholders**:
- `${COMPONENT_NAME}` - Component name
- `${PROPS_INTERFACE}` - Props interface definition
- `${STYLE_IMPORT}` - CSS import statement
- `${DESCRIPTION}` - Component description

### component-with-hooks-template.tsx

Component template with useState, useEffect examples.

**Additional placeholders**:
- `${HOOKS}` - Hook declarations
- `${HANDLERS}` - Event handler functions

### component-container-template.tsx

Container component template with data fetching.

**Additional placeholders**:
- `${API_IMPORT}` - API function import
- `${DATA_TYPE}` - Data type definition
- `${FETCH_LOGIC}` - Data fetching implementation

### test-template.test.tsx

React Testing Library test template.

**Placeholders**:
- `${COMPONENT_NAME}` - Component name
- `${IMPORT_PATH}` - Import path
- `${TEST_CASES}` - Generated test cases

### style-template.module.css

CSS Modules template.

**Placeholders**:
- `${COMPONENT_NAME_KEBAB}` - Component name in kebab-case
- `${BASE_STYLES}` - Base container styles

---

## Examples

See `examples/` directory for reference implementations:

1. **Button.tsx** - Simple component with variants
2. **SearchBar.tsx** - Component with hooks (useState, useEffect)
3. **UserProfile.tsx** - Container component with data fetching

Each example includes:
- Component implementation
- Test file
- Style file
- Usage documentation

---

## Best Practices

### Component Design
- Keep components **small and focused** (single responsibility)
- **Compose** complex UIs from simple components
- **Lift state up** only when necessary
- Use **descriptive names** (UserProfile, not UP)

### TypeScript
- **Define prop interfaces** explicitly
- **Avoid `any`** type (use `unknown` if needed)
- **Export types** for consumers
- **Use strict mode**

### Testing
- **Test user behavior**, not implementation
- **Query by role/text**, not test IDs
- **Test accessible attributes**
- **Mock external dependencies**

### Styling
- **CSS Modules** for scoped styles
- **BEM or descriptive class names**
- **Mobile-first** responsive design
- **Use CSS custom properties** for theming

### Accessibility
- **Semantic HTML** (button, nav, main, etc.)
- **ARIA labels** when needed
- **Keyboard navigation** support
- **Focus management** in modals/dropdowns

---

## Troubleshooting

### Component Not Rendering

**Problem**: Generated component throws errors

**Solutions**:
1. Check TypeScript compilation errors
2. Verify all imports are correct
3. Check props interface matches usage
4. Validate JSX syntax

### Tests Failing

**Problem**: Generated tests don''t pass

**Solutions**:
1. Ensure React Testing Library is installed
2. Check test queries match component output
3. Verify mocks are set up correctly
4. Run tests with `--verbose` flag

### Styles Not Applying

**Problem**: CSS modules not loading

**Solutions**:
1. Check CSS module import syntax
2. Verify webpack/vite config supports CSS modules
3. Check className is applied to element
4. Inspect browser devtools for loaded styles

---

## Success Criteria

**This skill succeeds when**:
- [ ] Component file generated with valid TypeScript
- [ ] Test file created with passing tests
- [ ] Style file generated with scoped styles
- [ ] Barrel export allows clean imports
- [ ] Props interface matches requirements
- [ ] Code follows React best practices
- [ ] Accessibility attributes included

---

**Auto-invoke this skill when creating React components to ensure consistency and save time** ⚛️
' WHERE slug = 'neversight-frontend-component';
UPDATE skills SET content = '---
name: opentui
description: Build terminal UIs with OpenTUI/React. Use when creating screens, components, handling keyboard input, managing scroll, or navigating between views. Covers JSX intrinsics, useKeyboard, scrollbox patterns, and state preservation.
---

# OpenTUI/React Quick Reference

OpenTUI is a React renderer for terminal UIs using Yoga layout (like React Native). **NOT React DOM or Ink.**

## Version Info

- **Current:** 0.1.69 (updated), **Latest:** 0.1.69
- **Context repo:** `.context/repos/opentui` (run `bun run sync-context` if missing)

## Core Imports

```typescript
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import type { ScrollBoxRenderable, KeyEvent } from "@opentui/core";
```

## JSX Elements (Lowercase!)

```tsx
// CORRECT - OpenTUI intrinsics
<box style={{ flexDirection: "column" }}>
  <text fg="#ffffff">Hello</text>
  <scrollbox ref={scrollRef} focused />
</box>

// WRONG - Not OpenTUI
<div>, <span>, <Box>, <Text>
```

| Element | Purpose | Key Props |
|---------|---------|-----------|
| `<box>` | Container/layout | `style`, `id`, `onMouse` |
| `<text>` | Text content (strings only!) | `fg`, `bg`, `selectable` |
| `<scrollbox>` | Scrollable container | `ref`, `focused` |
| `<a>` | Hyperlink (OSC8) | `href`, `fg` |
| `<input>` | Text input | `focused`, `onInput`, `onSubmit` |
| `<textarea>` | Multi-line input | `ref`, `focused`, `placeholder` |

## Critical Rules

### 1. Text Only Accepts Strings

```tsx
// WRONG - Cannot nest elements in <text>
<text>Hello <text fg="red">world</text></text>

// CORRECT - Use row box for inline styling
<box style={{ flexDirection: "row" }}>
  <text>Hello </text>
  <text fg="red">world</text>
</box>
```

### 2. Always Check `focused` in Keyboard Handlers

```tsx
useKeyboard((key) => {
  if (!focused) return;  // MUST check first!
  if (key.name === "j") moveDown();
});
```

### 3. Save Scroll Position Synchronously

```tsx
// WRONG - useEffect runs after render, scroll already reset
useEffect(() => { if (!focused) savedScroll.current = scrollRef.current?.scrollTop; }, [focused]);

// CORRECT - Save before state change
const handleSelect = () => {
  savedScroll.current = scrollRef.current?.scrollTop;  // Save first!
  onSelect(item);
};
```

## Hyperlinks (New in 0.1.64+)

```tsx
<text>
  Visit <a href="https://example.com">example.com</a> for more
</text>
```

Renders clickable links in terminals supporting OSC8 (iTerm2, Kitty, etc.).

## Key Names

| Key | `key.name` | | Key | `key.name` |
|-----|------------|--|-----|------------|
| Enter | `"return"` | | Arrows | `"up"`, `"down"`, `"left"`, `"right"` |
| Escape | `"escape"` | | Letters | `"a"`, `"b"`, `"j"`, `"k"` |
| Tab | `"tab"` | | Shift+Letter | `"A"`, `"B"`, `"G"` |

## Scrollbox API

```typescript
const scrollbox = scrollRef.current;
scrollbox.scrollTop           // Current position
scrollbox.scrollHeight        // Total content height
scrollbox.viewport.height     // Visible area
scrollbox.scrollTo(pos)       // Absolute scroll
scrollbox.scrollBy(delta)     // Relative scroll
scrollbox.getChildren()       // Find elements by ID
```

## Common Layout Patterns

```tsx
// Full-height with fixed header/footer
<box style={{ flexDirection: "column", height: "100%" }}>
  <box style={{ flexShrink: 0 }}>{/* Header */}</box>
  <scrollbox style={{ flexGrow: 1 }}>{/* Content */}</scrollbox>
  <box style={{ flexShrink: 0 }}>{/* Footer */}</box>
</box>

// Prevent unwanted spacing (Yoga quirk)
<box style={{ justifyContent: "flex-start", marginBottom: 0, paddingBottom: 0 }}>
```

## React DevTools (Optional)

```bash
bun add --dev react-devtools-core@7
npx react-devtools@7  # Start standalone devtools
DEV=true bun run start  # Run app with devtools enabled
```

## Detailed References

- [COMPONENTS.md](COMPONENTS.md) - JSX elements, styling, text nesting
- [KEYBOARD.md](KEYBOARD.md) - Keyboard handling, key names, focus patterns
- [SCROLLBOX.md](SCROLLBOX.md) - Scrollbox API, scroll preservation, windowed lists
- [LAYOUT.md](LAYOUT.md) - Flex layout, Yoga engine, spacing issues
- [PATTERNS.md](PATTERNS.md) - Screen navigation, state preservation, library compatibility

## xfeed Reference Files

- `src/app.tsx` - Screen routing, navigation history
- `src/components/PostList.tsx` - Scrollbox with preservation
- `src/components/PostCard.tsx` - Component styling, mouse handling
- `src/modals/FolderPicker.tsx` - Windowed list pattern
- `src/hooks/useListNavigation.ts` - Vim-style navigation
' WHERE slug = 'ainergiz-opentui';
UPDATE skills SET content = '---
name: chat-ui
description: "Chat UI building blocks for React/Next.js from ui.inference.sh. Components: container, messages, input, typing indicators, avatars. Capabilities: chat interfaces, message lists, input handling, streaming. Use for: building custom chat UIs, messaging interfaces, AI assistants. Triggers: chat ui, chat component, message list, chat input, shadcn chat,"  react chat, chat interface, messaging ui, conversation ui, chat building blocks
---

# Chat UI Components

Chat building blocks from [ui.inference.sh](https://ui.inference.sh).

![Chat UI Components](https://cloud.inference.sh/app/files/u/4mg21r6ta37mpaz6ktzwtt8krr/01kgvftp7hb8wby7z66fvs9asd.jpeg)

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
npx skills add inferencesh/skills@agent-ui

# Declarative widgets
npx skills add inferencesh/skills@widgets-ui

# Markdown rendering
npx skills add inferencesh/skills@markdown-ui
```

## Documentation

- [Chatting with Agents](https://inference.sh/docs/agents/chatting) - Building chat interfaces
- [Agent UX Patterns](https://inference.sh/blog/ux/agent-ux-patterns) - Chat UX best practices
- [Real-Time Streaming](https://inference.sh/blog/observability/streaming) - Streaming responses

Component docs: [ui.inference.sh/blocks/chat](https://ui.inference.sh/blocks/chat)
' WHERE slug = 'neversight-chat-ui-ill-md';
UPDATE skills SET content = '---
name: react-component-design
description: Design React components following Tetris architecture guidelines. Use when creating new components, refactoring components, optimizing performance, or improving component structure. Auto-triggers on phrases like "create a component", "refactor this component", "optimize rendering", or "improve component design". Emphasizes component consolidation, unified patterns, and efficient hook usage.
allowed-tools: Read, Edit, Grep, Glob
---

# React Component Design Guide

Design patterns for React components in the Tetris project.

## Core Principles

1. **Component Consolidation**: Prefer unified components over excessive fragmentation
2. **Functional Components**: No class components
3. **Custom Hooks**: Extract reusable logic
4. **Type Aliases**: Use `type` instead of `interface` for props
5. **Dynamic IDs**: Use `useId()` hook for accessibility
6. **Optimized Patterns**: Minimize re-renders and prop drilling

## Component Structure

### Basic Component Template

```typescript
import { useId } from ''react''
import { useTranslation } from ''react-i18next''

type GameButtonProps = {
  onClick: () => void
  label: string
  disabled?: boolean
}

export const GameButton = ({ onClick, label, disabled = false }: GameButtonProps) => {
  const { t } = useTranslation()
  const id = useId()

  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      className="game-button"
    >
      {t(label)}
    </button>
  )
}
```

### Component with Custom Hook

```typescript
// Custom hook for game logic
const useGameState = () => {
  const [board, setBoard] = useState<Board>(createBoard())
  const [currentPiece, setCurrentPiece] = useState<Piece | null>(null)
  const [score, setScore] = useState(0)

  const placePiece = useCallback((position: Position) => {
    if (!currentPiece) return

    const result = tryPlacePiece(board, currentPiece, position)
    if (result.ok) {
      setBoard(result.value.board)
      setScore((s) => s + result.value.points)
    }
  }, [board, currentPiece])

  return { board, currentPiece, score, placePiece }
}

// Component using the hook
export const GameBoard = () => {
  const { board, currentPiece, score, placePiece } = useGameState()

  return (
    <div className="game-board">
      <Board data={board} currentPiece={currentPiece} />
      <Score value={score} />
    </div>
  )
}
```

## Design Patterns

### 1. Component Consolidation

```typescript
// ❌ Excessive fragmentation
const Header = () => <div className="header">...</div>
const HeaderTitle = () => <h1>...</h1>
const HeaderSubtitle = () => <p>...</p>
const HeaderActions = () => <div>...</div>

// ✅ Consolidated component
type GameHeaderProps = {
  title: string
  subtitle: string
  actions: ReactNode
}

export const GameHeader = ({ title, subtitle, actions }: GameHeaderProps) => (
  <header className="game-header">
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    <div className="actions">{actions}</div>
  </header>
)
```

### 2. Composition over Props Drilling

```typescript
// ❌ Props drilling
<Game>
  <Board score={score} level={level} />
  <Controls score={score} level={level} />
  <Stats score={score} level={level} />
</Game>

// ✅ Context for shared state
const GameStateContext = createContext<GameState | null>(null)

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const gameState = useGameState()
  return (
    <GameStateContext.Provider value={gameState}>
      {children}
    </GameStateContext.Provider>
  )
}

// Usage
<GameProvider>
  <Board />
  <Controls />
  <Stats />
</GameProvider>
```

### 3. Memoization for Performance

```typescript
// ✅ Memoize expensive components
export const Board = memo(({ cells, currentPiece }: BoardProps) => {
  return (
    <div className="board">
      {cells.map((row, y) => (
        <Row key={y} cells={row} y={y} currentPiece={currentPiece} />
      ))}
    </div>
  )
})

// ✅ Memoize callbacks
const GameControls = () => {
  const { movePiece, rotatePiece } = useGame()

  const handleLeft = useCallback(() => {
    movePiece(''LEFT'')
  }, [movePiece])

  const handleRotate = useCallback(() => {
    rotatePiece()
  }, [rotatePiece])

  return (
    <div>
      <button onClick={handleLeft}>{t(''controls.left'')}</button>
      <button onClick={handleRotate}>{t(''controls.rotate'')}</button>
    </div>
  )
}
```

### 4. Type-safe Props

```typescript
// ✅ Use type aliases (not interface)
type ButtonVariant = ''primary'' | ''secondary'' | ''danger''

type ButtonProps = {
  variant: ButtonVariant
  size?: ''small'' | ''medium'' | ''large''
  onClick: () => void
  children: ReactNode
  disabled?: boolean
}

export const Button = ({
  variant,
  size = ''medium'',
  onClick,
  children,
  disabled = false
}: ButtonProps) => {
  const className = cn(
    ''button'',
    `button--${variant}`,
    `button--${size}`,
    disabled && ''button--disabled''
  )

  return (
    <button className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
```

### 5. Dynamic IDs for Accessibility

```typescript
// ❌ Static IDs
export const FormField = ({ label }: FormFieldProps) => (
  <div>
    <label htmlFor="game-input">{label}</label>
    <input id="game-input" />
  </div>
)

// ✅ Dynamic IDs with useId()
export const FormField = ({ label }: FormFieldProps) => {
  const id = useId()

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} />
    </div>
  )
}
```

## Custom Hooks Best Practices

### 1. Extract Reusable Logic

```typescript
// useKeyPress hook
export const useKeyPress = (targetKey: string, callback: () => void) => {
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === targetKey) {
        callback()
      }
    }

    window.addEventListener(''keydown'', handleKeyPress)
    return () => {
      window.removeEventListener(''keydown'', handleKeyPress)
    }
  }, [targetKey, callback])
}

// Usage in component
const GameControls = () => {
  const { movePiece } = useGame()

  useKeyPress(''ArrowLeft'', () => movePiece(''LEFT''))
  useKeyPress(''ArrowRight'', () => movePiece(''RIGHT''))
  useKeyPress('' '', () => movePiece(''DROP''))

  return <div>...</div>
}
```

### 2. State Management Hooks

```typescript
// useLocalStorage hook
export const useLocalStorage = <T,>(
  key: string,
  initialValue: T
): [T, (value: T) => void] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : initialValue
  })

  const setValue = useCallback((value: T) => {
    setStoredValue(value)
    localStorage.setItem(key, JSON.stringify(value))
  }, [key])

  return [storedValue, setValue]
}

// Usage
const [highScore, setHighScore] = useLocalStorage(''tetris:highScore'', 0)
```

## Component Checklist

- [ ] Functional component (no classes)
- [ ] Type alias for props (not interface)
- [ ] i18n for all user-facing strings
- [ ] useId() for dynamic IDs
- [ ] Custom hooks for reusable logic
- [ ] Memoization where appropriate
- [ ] Minimal prop drilling (use context)
- [ ] Consolidated (not overly fragmented)

## Performance Optimization

```typescript
// ✅ Optimize with memo and useMemo
export const ExpensiveComponent = memo(({ data }: Props) => {
  const processedData = useMemo(() => {
    return expensiveCalculation(data)
  }, [data])

  return <div>{processedData}</div>
})

// ✅ Optimize callbacks with useCallback
const Parent = () => {
  const [count, setCount] = useState(0)

  const increment = useCallback(() => {
    setCount((c) => c + 1)
  }, [])

  return <Child onIncrement={increment} />
}
```

## When This Skill Activates

- "Create a new component"
- "Refactor this component"
- "Optimize component performance"
- "Improve component structure"
- "Extract logic to custom hook"
- "Reduce re-renders"

' WHERE slug = 'neversight-react-component-design';