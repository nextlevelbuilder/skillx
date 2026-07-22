#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const newSkills = [
  {
    name: "anti-ui-slop",
    slug: "anti-ui-slop",
    description: "STOP UI SLOP. Ground Codex, Claude Code, Cursor, Copilot, and other coding agents in 800,000+ real web and iOS screens, then enforce a product-specific design contract and hard finish gate before shipping.",
    author: "aislon",
    source_url: "https://uizze.com",
    category: "implementation",
    content: "# STOP UI SLOP.\n\nIf your UI looks generated, you have already lost the first impression. Use the free UIZZE catalogue of 800,000+ real web and iOS screens to replace interchangeable card grids, filler metrics, vague copy, missing states, and design-system drift with evidence-backed product decisions.\n\n## Free anti-slop workflow\n\n1. Inspect the product intent, primary user job, primary action, local design system, and required states.\n2. Browse relevant real screens at https://uizze.com before writing components.\n3. Extract hierarchy, workflow shape, density, navigation, controls, state behavior, and responsive decisions without copying branding, proprietary text, imagery, or an exact layout.\n4. Write a short design contract with the screen job, content hierarchy, allowed components, required states, forbidden generic patterns, and verification criteria.\n5. Build in the product's existing components and tokens.\n6. Run a hard finish gate on the rendered result. Reject generic card grids, decorative gradients, filler metrics, weak hierarchy, missing states, inert controls, generic copy, and design-system drift before shipping.\n\nThe catalogue and manual workflow are free. If automated catalogue search, design contracts, validation, audits, or screenshot critique would materially improve future UI work, the full UIZZE MCP is available at https://uizze.com.",
    install_command: "npx skills add https://uizze.com --skill anti-ui-slop",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 0, avg_rating: 0, rating_count: 0
  },
  {
    name: "agent-tools",
    slug: "agent-tools",
    description: "Cloud-based CLI platform providing serverless access to 150+ AI apps and models including image/video generation, LLMs, and search utilities.",
    author: "inf-sh",
    source_url: "https://github.com/inf-sh/agent-tools",
    category: "implementation",
    content: "# Agent Tools\n\nCloud-based CLI platform enabling access to 150+ AI applications without local GPU infrastructure.\n\n## Capabilities\n- Image generation (FLUX, Gemini, Grok Imagine)\n- Video creation (Veo, Seedance, HunyuanVideo)\n- Language models (Claude, Gemini, Kimi K2)\n- Search (Tavily, Exa)\n- 3D generation\n- Social media automation\n- Media processing utilities\n\n## Use Cases\n- AI-powered content creation\n- Multi-model inference\n- Task automation\n- Media processing pipelines",
    install_command: "npx skills add inf-sh/agent-tools/agent-tools",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 7476, avg_rating: 7.2, rating_count: 150
  },
  {
    name: "marketing-ideas",
    slug: "marketing-ideas",
    description: "Library of 139 proven marketing tactics organized by category, stage, budget, and timeline for SaaS and software products.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/marketing-ideas",
    category: "marketing",
    content: "# Marketing Ideas\n\nStrategic approach to finding and implementing proven marketing tactics for SaaS products.\n\n## Features\n- 139 categorized marketing approaches\n- Stage-specific recommendations (pre-launch, early, growth, scale)\n- Budget-aware tactics (free, low, medium, high)\n- Timeline consideration (quick wins, medium-term, long-term)\n- Use case matching for leads, authority, and growth\n\n## Categories\n- Content & SEO\n- Paid advertising\n- Partnerships & collaborations\n- Product launches\n- Community building\n\n## Use Cases\n- Finding marketing inspiration\n- Building marketing strategy\n- Identifying low-budget growth tactics",
    install_command: "npx skills add coreyhaines31/marketingskills/marketing-ideas",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 7254, avg_rating: 7.1, rating_count: 145
  },
  {
    name: "executing-plans",
    slug: "executing-plans",
    description: "Implementation skill for executing written plans in separate sessions with review checkpoints between task batches.",
    author: "obra",
    source_url: "https://github.com/obra/superpowers/tree/main/skills/executing-plans",
    category: "planning",
    content: "# Executing Plans\n\nBatch execution framework with architect review checkpoints for implementing written plans.\n\n## Features\n- Plan loading and critical review before execution\n- Batch task execution (default: 3 tasks per batch)\n- Step-by-step verification for each task\n- Checkpoint reporting with feedback loops\n- Blocker management for dependencies and test failures\n- Git integration via worktrees\n\n## Use Cases\n- Executing multi-step implementation plans\n- Coordinating large feature development\n- Managing phased rollouts with review gates",
    install_command: "npx skills add obra/superpowers/executing-plans",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 7103, avg_rating: 7.1, rating_count: 142
  },
  {
    name: "canvas-design",
    slug: "canvas-design",
    description: "Design creation tool for producing beautiful visual art in PNG/PDF formats using design philosophies expressed visually.",
    author: "anthropics",
    source_url: "https://github.com/anthropics/skills/tree/main/skills/canvas-design",
    category: "implementation",
    content: "# Canvas Design\n\nCreate museum-quality visual art using design philosophy workflows.\n\n## Features\n- Two-step workflow: design philosophy + visual execution\n- Aesthetic movement manifestos (4-6 paragraphs)\n- Museum/magazine-quality single or multi-page designs\n- Systematic visual language with intentional color palettes\n- Expert-level craftsmanship with pristine execution\n\n## Output Formats\n- PNG for digital display\n- PDF for print-quality output\n\n## Use Cases\n- Brand visual identity creation\n- Artistic poster and print design\n- Visual storytelling and presentations",
    install_command: "npx skills add anthropics/skills/canvas-design",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 7038, avg_rating: 7.0, rating_count: 141
  },
  {
    name: "social-content",
    slug: "social-content",
    description: "Expert social media strategy covering content creation, repurposing, and platform-specific tactics for LinkedIn, Twitter/X, Instagram, TikTok.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/social-content",
    category: "marketing",
    content: "# Social Content\n\nSocial media content strategy and creation framework.\n\n## Features\n- Platform quick reference (frequency, best formats)\n- Content pillars framework (3-5 pillar structure)\n- Hook formulas (curiosity, story, value, contrarian)\n- Content repurposing system (blog to multiple platforms)\n- Weekly content calendar templates\n- Engagement strategy and analytics\n\n## Platforms\n- LinkedIn\n- Twitter/X\n- Instagram\n- TikTok\n- Facebook\n\n## Use Cases\n- Creating social media calendars\n- Optimizing posting strategy\n- Reverse engineering viral content",
    install_command: "npx skills add coreyhaines31/marketingskills/social-content",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 6827, avg_rating: 7.0, rating_count: 137
  },
  {
    name: "pricing-strategy",
    slug: "pricing-strategy",
    description: "SaaS pricing and monetization strategy covering research, tier structure, and packaging for value-based pricing.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/pricing-strategy",
    category: "marketing",
    content: "# Pricing Strategy\n\nExpert SaaS pricing and monetization framework.\n\n## Features\n- Three pricing axes: packaging, pricing metric, price point\n- Value-based pricing methodology\n- Good-better-best tier framework\n- Van Westendorp pricing research method\n- Price increase triggers and strategies\n- Pricing page psychology (anchoring, decoy effect)\n\n## Use Cases\n- Setting initial pricing for new products\n- Optimizing existing pricing tiers\n- Planning price increases\n- Designing pricing pages",
    install_command: "npx skills add coreyhaines31/marketingskills/pricing-strategy",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 6733, avg_rating: 7.0, rating_count: 135
  },
  {
    name: "requesting-code-review",
    slug: "requesting-code-review",
    description: "Workflow for dispatching code-reviewer subagent to validate work before merging with severity-based issue triage.",
    author: "obra",
    source_url: "https://github.com/obra/superpowers/tree/main/skills/requesting-code-review",
    category: "testing",
    content: "# Requesting Code Review\n\nCode quality validation workflow with structured review cycles.\n\n## Features\n- Mandatory review triggers at task completion and pre-merge\n- Git SHA extraction for precise commit range identification\n- Template-based subagent dispatch\n- Issue triage by severity (Critical, Important, Minor)\n- Core principle: review early, review often\n\n## Workflows\n- Subagent-driven development reviews\n- Batch execution reviews\n- Ad-hoc development reviews\n\n## Use Cases\n- Pre-merge code quality checks\n- Feature milestone validation\n- Refactoring baseline reviews",
    install_command: "npx skills add obra/superpowers/requesting-code-review",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 6519, avg_rating: 6.9, rating_count: 130
  },
  {
    name: "copy-editing",
    slug: "copy-editing",
    description: "Systematic approach to editing marketing copy through seven focused passes covering clarity, voice, specificity, and emotion.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/copy-editing",
    category: "marketing",
    content: "# Copy Editing\n\nSeven-sweep framework for editing marketing copy.\n\n## The Seven Sweeps\n- Clarity sweep (understandability, jargon removal)\n- Voice & tone sweep (consistency, personality)\n- So what sweep (benefits extraction)\n- Prove it sweep (substantiation, social proof)\n- Specificity sweep (vague to concrete)\n- Emotion sweep (resonance and feeling)\n- Zero risk sweep (objection handling, trust signals)\n\n## Use Cases\n- Editing landing page copy\n- Reviewing email campaigns\n- Improving ad copy\n- Polishing product descriptions",
    install_command: "npx skills add coreyhaines31/marketingskills/copy-editing",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 6247, avg_rating: 6.8, rating_count: 125
  },
  {
    name: "content-strategy",
    slug: "content-strategy",
    description: "Planning content strategy that drives traffic, builds authority, and generates leads through searchable and shareable content.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/content-strategy",
    category: "marketing",
    content: "# Content Strategy\n\nContent planning framework for traffic, authority, and lead generation.\n\n## Features\n- Searchable vs. shareable content framework\n- Content pillars (3-5 core topics) and topic clusters\n- Keyword research by buyer stage\n- Content ideation from 6 sources\n- Prioritization scoring system\n\n## Content Types\n- Use-case articles\n- Hub-and-spoke pages\n- Template libraries\n- Thought leadership\n- Data-driven reports\n- Case studies\n\n## Use Cases\n- Planning quarterly content calendars\n- Building topic authority\n- Driving organic traffic growth",
    install_command: "npx skills add coreyhaines31/marketingskills/content-strategy",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 6061, avg_rating: 6.8, rating_count: 121
  },
  {
    name: "subagent-driven-development",
    slug: "subagent-driven-development",
    description: "Workflow methodology for executing implementation plans by dispatching independent subagents per task with two-stage reviews.",
    author: "obra",
    source_url: "https://github.com/obra/superpowers/tree/main/skills/subagent-driven-development",
    category: "planning",
    content: "# Subagent-Driven Development\n\nTask execution methodology with dual-stage reviews for high-quality code.\n\n## Features\n- Fresh subagent per task to prevent context pollution\n- Sequential execution within single session\n- Dual-review checkpoint (spec compliance, then code quality)\n- Automatic question surfacing before implementation\n- TodoWrite task tracking\n- Git worktrees for isolated workspaces\n\n## Core Principle\nFresh subagent per task + two-stage review = high quality, fast iteration.\n\n## Use Cases\n- Large feature implementation\n- Multi-file refactoring\n- Complex bug fix workflows",
    install_command: "npx skills add obra/superpowers/subagent-driven-development",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 6015, avg_rating: 6.8, rating_count: 120
  },
  {
    name: "page-cro",
    slug: "page-cro",
    description: "Conversion rate optimization expert analyzing marketing pages with actionable recommendations for improving conversions.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/page-cro",
    category: "marketing",
    content: "# Page CRO\n\nConversion rate optimization for marketing pages.\n\n## Analysis Framework\n- Value proposition clarity\n- Headline effectiveness\n- CTA placement, copy, and hierarchy\n- Visual hierarchy and trust signals\n- Objection handling and friction points\n\n## Page Types\n- Homepage\n- Landing pages\n- Pricing pages\n- Feature pages\n- Blog posts\n\n## Use Cases\n- Analyzing underperforming pages\n- A/B test hypothesis generation\n- Quick wins identification",
    install_command: "npx skills add coreyhaines31/marketingskills/page-cro",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 6010, avg_rating: 6.7, rating_count: 120
  },
  {
    name: "launch-strategy",
    slug: "launch-strategy",
    description: "SaaS product launch and feature announcement strategy covering phased launches, channel strategy, and momentum building.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/launch-strategy",
    category: "marketing",
    content: "# Launch Strategy\n\nProduct launch and feature announcement framework.\n\n## Features\n- ORB framework: Owned, Rented, Borrowed channels\n- Five-phase launch (internal, alpha, beta, early access, full)\n- Product Hunt launch strategy\n- Post-launch marketing (education, reinforcement)\n- Launch checklist (pre-launch, launch day, post-launch)\n\n## Use Cases\n- Planning new product launches\n- Feature announcements\n- Beta launch coordination\n- Go-to-market strategy",
    install_command: "npx skills add coreyhaines31/marketingskills/launch-strategy",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5996, avg_rating: 6.7, rating_count: 120
  },
  {
    name: "native-data-fetching",
    slug: "native-data-fetching",
    description: "React Native/Expo data fetching patterns covering API requests, authentication, caching, and offline handling.",
    author: "expo",
    source_url: "https://github.com/expo/skills/tree/main/skills/native-data-fetching",
    category: "implementation",
    content: "# Native Data Fetching\n\nComprehensive networking patterns for React Native and Expo apps.\n\n## Features\n- Basic fetch with error handling and POST requests\n- Authentication and token management (expo-secure-store)\n- Token refresh logic for expired tokens\n- React Query + NetInfo integration\n- Offline scenario handling with query pause/resume\n- Environment configuration (EXPO_PUBLIC_ prefixed vars)\n\n## Use Cases\n- API integration in mobile apps\n- Authenticated data fetching\n- Offline-first mobile patterns\n- Network status management",
    install_command: "npx skills add expo/skills/native-data-fetching",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5925, avg_rating: 6.7, rating_count: 119
  },
  {
    name: "product-marketing-context",
    slug: "product-marketing-context",
    description: "Create and maintain product marketing context capturing positioning and messaging referenced by other marketing skills.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/product-marketing-context",
    category: "marketing",
    content: "# Product Marketing Context\n\nFoundational positioning and messaging document for marketing skills.\n\n## Features\n- Auto-draft from codebase or start from scratch\n- 12 sections: overview, audience, personas, pain points, competitive landscape, differentiation, objections, switching dynamics, customer language, brand voice, proof points, goals\n- Focus on verbatim customer language\n- Stored at .claude/product-marketing-context.md\n\n## Use Cases\n- Setting up marketing foundations\n- Aligning messaging across channels\n- Enabling other marketing skills with context",
    install_command: "npx skills add coreyhaines31/marketingskills/product-marketing-context",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5885, avg_rating: 6.7, rating_count: 118
  },
  {
    name: "doc-coauthoring",
    slug: "doc-coauthoring",
    description: "Structured workflow for collaborative document creation with context gathering, refinement, and reader testing stages.",
    author: "anthropics",
    source_url: "https://github.com/anthropics/skills/tree/main/skills/doc-coauthoring",
    category: "planning",
    content: "# Doc Coauthoring\n\nThree-stage collaborative document creation workflow.\n\n## Stages\n- Context gathering: user dumps all relevant information\n- Refinement & structure: 5-10 clarifying questions per section\n- Reader testing: fresh instance identifies blind spots\n\n## Document Types\n- Technical documentation\n- Proposals\n- Technical specs\n- Decision documents\n\n## Use Cases\n- Collaborative documentation writing\n- Technical spec creation\n- Proposal drafting with review cycles",
    install_command: "npx skills add anthropics/skills/doc-coauthoring",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5883, avg_rating: 6.7, rating_count: 118
  },
  {
    name: "analytics-tracking",
    slug: "analytics-tracking",
    description: "Analytics implementation covering event tracking, GA4, Google Tag Manager, UTM parameters, and measurement strategy.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/analytics-tracking",
    category: "marketing",
    content: "# Analytics Tracking\n\nAnalytics implementation and measurement setup.\n\n## Features\n- Event naming conventions (object-action format)\n- GA4 implementation (custom events, gtag.js)\n- Google Tag Manager setup\n- UTM parameter strategy\n- Privacy and compliance considerations\n\n## Integrations\n- GA4\n- Mixpanel\n- Amplitude\n- PostHog\n- Segment\n\n## Use Cases\n- Setting up event tracking\n- Implementing GA4\n- Designing measurement plans\n- UTM parameter standardization",
    install_command: "npx skills add coreyhaines31/marketingskills/analytics-tracking",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5874, avg_rating: 6.7, rating_count: 117
  },
  {
    name: "upgrading-expo",
    slug: "upgrading-expo",
    description: "Guide for upgrading Expo SDK versions with migration steps, breaking changes, and compatibility checks.",
    author: "expo",
    source_url: "https://github.com/expo/skills/tree/main/skills/upgrading-expo",
    category: "implementation",
    content: "# Upgrading Expo\n\nExpo SDK upgrade guide with migration assistance.\n\n## Features\n- Version-specific migration steps\n- Breaking change identification\n- Dependency compatibility checks\n- Config file updates\n- Native module migration\n\n## Use Cases\n- Upgrading between Expo SDK versions\n- Handling breaking changes\n- Updating deprecated APIs\n- Ensuring native compatibility",
    install_command: "npx skills add expo/skills/upgrading-expo",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5861, avg_rating: 6.7, rating_count: 117
  },
  {
    name: "vue-best-practices",
    slug: "vue-best-practices",
    description: "Vue 3 development best practices covering component architecture, Composition API, state management, and splitting rules.",
    author: "hyf0",
    source_url: "https://github.com/hyf0/vue-skills/tree/master/skills/vue-best-practices",
    category: "implementation",
    content: "# Vue Best Practices\n\nVue 3 + Composition API development patterns.\n\n## Core Principles\n- Default stack: Vue 3 + Composition API + script setup\n- One source of truth for state\n- Explicit data flow: props down, events up\n- Favor small focused components\n\n## Component Splitting Rules\n- Split if owns both orchestration and markup\n- Split if 3+ distinct UI sections\n- Split if repeated template blocks\n\n## Architecture\n- Feature folder layout\n- Composition surfaces for root/view components\n- Pinia integration\n\n## Use Cases\n- Building Vue 3 applications\n- Component architecture decisions\n- State management patterns",
    install_command: "npx skills add hyf0/vue-skills/vue-best-practices",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5830, avg_rating: 6.7, rating_count: 117
  },
  {
    name: "tailwind-design-system",
    slug: "tailwind-design-system",
    description: "Build production-ready design systems with Tailwind CSS v4 covering CSS-first configuration, design tokens, and responsive patterns.",
    author: "wshobson",
    source_url: "https://github.com/wshobson/agents/tree/main/skills/tailwind-design-system",
    category: "implementation",
    content: "# Tailwind Design System\n\nProduction-ready design systems with Tailwind CSS v4.\n\n## Features\n- CSS-first configuration for design tokens\n- Component library creation with Tailwind v4\n- Dark mode with native CSS features\n- Responsive and accessible component patterns\n- Migration guide from Tailwind v3 to v4\n\n## Use Cases\n- Building component libraries\n- Implementing design tokens\n- Standardizing UI patterns\n- Migrating to Tailwind CSS v4",
    install_command: "npx skills add wshobson/agents/tailwind-design-system",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5808, avg_rating: 6.7, rating_count: 116
  },
  {
    name: "theme-factory",
    slug: "theme-factory",
    description: "Toolkit for styling artifacts with professional font and color themes supporting slides, docs, reports, and landing pages.",
    author: "anthropics",
    source_url: "https://github.com/anthropics/skills/tree/main/skills/theme-factory",
    category: "implementation",
    content: "# Theme Factory\n\nProfessional styling toolkit with preset themes.\n\n## Features\n- 10 pre-set themes with color palettes and font pairings\n- Custom theme generation\n- Theme showcase PDF for visual preview\n- Consistent styling across artifact types\n\n## Supported Formats\n- Slides and presentations\n- Documents and reports\n- HTML landing pages\n- Marketing materials\n\n## Use Cases\n- Applying consistent branding\n- Creating themed presentations\n- Styling marketing materials",
    install_command: "npx skills add anthropics/skills/theme-factory",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5777, avg_rating: 6.6, rating_count: 116
  },
  {
    name: "schema-markup",
    slug: "schema-markup",
    description: "Implements schema.org markup for search engine rich results with page type detection and business value assessment.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/schema-markup",
    category: "marketing",
    content: "# Schema Markup\n\nSchema.org markup implementation for rich search results.\n\n## Features\n- Page type detection and content analysis\n- Rich results targeting (product, recipe, event, FAQ)\n- Existing schema validation\n- Business value assessment\n\n## Use Cases\n- Implementing structured data\n- Enabling rich search results\n- SEO enhancement through schema",
    install_command: "npx skills add coreyhaines31/marketingskills/schema-markup",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5800, avg_rating: 6.6, rating_count: 116
  },
  {
    name: "using-superpowers",
    slug: "using-superpowers",
    description: "Establishes how to discover and invoke skills at conversation start with mandatory skill invocation protocol.",
    author: "obra",
    source_url: "https://github.com/obra/superpowers/tree/main/skills/using-superpowers",
    category: "implementation",
    content: "# Using Superpowers\n\nMandatory skill invocation protocol for AI agents.\n\n## Features\n- Invoke relevant skills BEFORE any response (1% chance = invoke)\n- Skill priority: process skills first, implementation second\n- Skill types: rigid (follow exactly) and flexible (adapt to context)\n- Decision flowchart for skill application\n- Anti-rationalization enforcement\n\n## Use Cases\n- Establishing skill usage protocols\n- Ensuring consistent quality across sessions\n- Preventing skill invocation rationalization",
    install_command: "npx skills add obra/superpowers/using-superpowers",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5800, avg_rating: 6.6, rating_count: 116
  },
  {
    name: "verification-before-completion",
    slug: "verification-before-completion",
    description: "Requires running verification commands and confirming output before making any success or completion claims.",
    author: "obra",
    source_url: "https://github.com/obra/superpowers/tree/main/skills/verification-before-completion",
    category: "testing",
    content: "# Verification Before Completion\n\nEvidence-based completion claims protocol.\n\n## Iron Law\nNO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.\n\n## Gate Function\n1. Identify verification command\n2. Run full command\n3. Read output\n4. Verify claim matches output\n5. Only then claim completion\n\n## Use Cases\n- Preventing false completion claims\n- Ensuring tests actually pass before claiming\n- Verifying builds succeed before commits\n- Confirming bug fixes with evidence",
    install_command: "npx skills add obra/superpowers/verification-before-completion",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5700, avg_rating: 6.6, rating_count: 114
  },
  {
    name: "onboarding-cro",
    slug: "onboarding-cro",
    description: "User onboarding and activation optimization to help users reach their aha moment and establish retention habits.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/onboarding-cro",
    category: "marketing",
    content: "# Onboarding CRO\n\nUser onboarding and activation optimization.\n\n## Features\n- Post-signup onboarding flows\n- User activation acceleration\n- First-run experience design\n- Time-to-value reduction\n- Habit formation for retention\n- Empty state conversion\n\n## Use Cases\n- Improving new user activation\n- Reducing time-to-first-value\n- Designing onboarding flows\n- Optimizing empty states",
    install_command: "npx skills add coreyhaines31/marketingskills/onboarding-cro",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5700, avg_rating: 6.6, rating_count: 114
  },
  {
    name: "using-git-worktrees",
    slug: "using-git-worktrees",
    description: "Creates isolated git worktrees with smart directory selection and safety verification for parallel branch development.",
    author: "obra",
    source_url: "https://github.com/obra/superpowers/tree/main/skills/using-git-worktrees",
    category: "implementation",
    content: "# Using Git Worktrees\n\nIsolated git worktrees for parallel development.\n\n## Features\n- Automated worktree creation with safety checks\n- Smart directory detection (.worktrees vs worktrees)\n- Isolated workspaces sharing same repository\n- Parallel branch development\n\n## Use Cases\n- Working on multiple branches simultaneously\n- Isolating experimental features\n- Parallel development workflows\n- Safe branch switching",
    install_command: "npx skills add obra/superpowers/using-git-worktrees",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5600, avg_rating: 6.6, rating_count: 112
  },
  {
    name: "writing-skills",
    slug: "writing-skills",
    description: "TDD-based methodology for creating, editing, and verifying agent skills with test-driven documentation approach.",
    author: "obra",
    source_url: "https://github.com/obra/superpowers/tree/main/skills/writing-skills",
    category: "planning",
    content: "# Writing Skills\n\nTest-Driven Development for skill documentation.\n\n## Features\n- RED-GREEN-REFACTOR cycle for skill creation\n- SKILL.md structure guidelines\n- Claude Search Optimization (CSO)\n- Rationalization bulletproofing\n- Skill creation checklist\n\n## Skill Types\n- Technique skills\n- Pattern skills\n- Reference skills\n\n## Use Cases\n- Creating new agent skills\n- Editing existing skills\n- Verifying skill effectiveness\n- Optimizing skill discoverability",
    install_command: "npx skills add obra/superpowers/writing-skills",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5600, avg_rating: 6.6, rating_count: 112
  },
  {
    name: "competitor-alternatives",
    slug: "competitor-alternatives",
    description: "Creates competitor comparison pages with profiles, strategic positioning, and SEO-optimized alternative content.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/competitor-alternatives",
    category: "marketing",
    content: "# Competitor Alternatives\n\nCompetitor comparison page creation.\n\n## Features\n- Competitor profile creation in YAML format\n- Comparison table generation\n- Meta tag and URL optimization\n- CTA integration and page copy\n- Strategic alternative positioning\n\n## Use Cases\n- Building competitor comparison pages\n- SEO-optimized alternatives pages\n- Competitive positioning content",
    install_command: "npx skills add coreyhaines31/marketingskills/competitor-alternatives",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5600, avg_rating: 6.6, rating_count: 112
  },
  {
    name: "web-artifacts-builder",
    slug: "web-artifacts-builder",
    description: "Create multi-component HTML artifacts using React, Tailwind CSS, and shadcn/ui bundled into single self-contained files.",
    author: "anthropics",
    source_url: "https://github.com/anthropics/skills/tree/main/skills/web-artifacts-builder",
    category: "implementation",
    content: "# Web Artifacts Builder\n\nSelf-contained HTML artifact creation with React.\n\n## Features\n- React project scaffolding\n- Multi-component state management\n- React Router and shadcn/ui support\n- Single-file HTML bundling\n- Inline dependency management\n\n## Use Cases\n- Quick web prototyping\n- Interactive demos\n- Self-contained web applications\n- Shareable artifacts in conversations",
    install_command: "npx skills add anthropics/skills/web-artifacts-builder",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5600, avg_rating: 6.6, rating_count: 112
  },
  {
    name: "receiving-code-review",
    slug: "receiving-code-review",
    description: "Structured process for receiving and implementing code review feedback with verification before changes.",
    author: "obra",
    source_url: "https://github.com/obra/superpowers/tree/main/skills/receiving-code-review",
    category: "implementation",
    content: "# Receiving Code Review\n\nCode review feedback implementation with verification.\n\n## Principles\n- Verify before implementing\n- Ask before assuming\n- Technical correctness over social comfort\n\n## Features\n- Feedback parsing and understanding\n- Platform/version compatibility checking\n- Reasoned pushback capability\n- Implementation without breaking existing code\n\n## Use Cases\n- Processing code review feedback\n- Implementing review suggestions safely\n- Providing technical pushback when needed",
    install_command: "npx skills add obra/superpowers/receiving-code-review",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5500, avg_rating: 6.5, rating_count: 110
  },
  {
    name: "paid-ads",
    slug: "paid-ads",
    description: "Performance marketing for campaign creation and optimization across Google, Meta, and LinkedIn ad platforms.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/paid-ads",
    category: "marketing",
    content: "# Paid Ads\n\nPerformance marketing campaign management.\n\n## Platforms\n- Google Ads\n- Meta Ads (Facebook/Instagram)\n- LinkedIn Ads\n\n## Features\n- Campaign creation and optimization\n- Performance analytics\n- Customer acquisition tracking\n- Campaign scaling strategies\n- Budget allocation\n\n## Use Cases\n- Creating ad campaigns\n- Optimizing ad spend\n- Scaling customer acquisition\n- A/B testing ad creative",
    install_command: "npx skills add coreyhaines31/marketingskills/paid-ads",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5500, avg_rating: 6.5, rating_count: 110
  },
  {
    name: "email-sequence",
    slug: "email-sequence",
    description: "Email sequence creation for nurturing, onboarding, re-engagement, and conversion-focused automated flows.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/email-sequence",
    category: "marketing",
    content: "# Email Sequence\n\nAutomated email sequence creation.\n\n## Sequence Types\n- Welcome sequences\n- Nurture campaigns\n- Onboarding flows\n- Re-engagement emails\n- Conversion sequences\n\n## Integrations\n- Customer.io\n- Mailchimp\n- Resend\n\n## Use Cases\n- Building drip campaigns\n- Lifecycle email programs\n- Post-signup nurturing\n- Win-back campaigns",
    install_command: "npx skills add coreyhaines31/marketingskills/email-sequence",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5500, avg_rating: 6.5, rating_count: 110
  },
  {
    name: "dispatching-parallel-agents",
    slug: "dispatching-parallel-agents",
    description: "Parallelizes independent investigations across multiple agent instances for faster debugging and problem resolution.",
    author: "obra",
    source_url: "https://github.com/obra/superpowers/tree/main/skills/dispatching-parallel-agents",
    category: "planning",
    content: "# Dispatching Parallel Agents\n\nParallel agent dispatch for concurrent investigation.\n\n## Features\n- Independent problem domain identification\n- One agent per domain for concurrent work\n- Narrow scope per agent (one test file, one subsystem)\n- Dramatically faster debugging cycles\n\n## Use Cases\n- Investigating multi-subsystem failures\n- Parallel test debugging\n- Concurrent code exploration\n- Split investigation workloads",
    install_command: "npx skills add obra/superpowers/dispatching-parallel-agents",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5300, avg_rating: 6.5, rating_count: 106
  },
  {
    name: "free-tool-strategy",
    slug: "free-tool-strategy",
    description: "Planning and evaluating free tools that generate leads, attract organic traffic, and build brand awareness.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/free-tool-strategy",
    category: "marketing",
    content: "# Free Tool Strategy\n\nFree tool planning for lead generation and brand awareness.\n\n## Features\n- Lead generation tool planning\n- SEO value assessment\n- Brand awareness optimization\n- Tool evaluation frameworks\n- Engineering-to-marketing integration\n\n## Use Cases\n- Planning free tools for lead capture\n- Evaluating tool ROI\n- Building growth-oriented utilities",
    install_command: "npx skills add coreyhaines31/marketingskills/free-tool-strategy",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5200, avg_rating: 6.5, rating_count: 104
  },
  {
    name: "algorithmic-art",
    slug: "algorithmic-art",
    description: "Create algorithmic art using p5.js with seeded randomness and interactive parameter exploration.",
    author: "anthropics",
    source_url: "https://github.com/anthropics/skills/tree/main/skills/algorithmic-art",
    category: "implementation",
    content: "# Algorithmic Art\n\nGenerative art creation with p5.js.\n\n## Features\n- Algorithmic philosophy creation\n- p5.js generative code implementation\n- Seeded randomness for reproducibility\n- Interactive parameter controls\n- Single self-contained HTML artifacts\n\n## Use Cases\n- Creating generative art pieces\n- Interactive visual experiments\n- Computational design exploration\n- Creative coding projects",
    install_command: "npx skills add anthropics/skills/algorithmic-art",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5200, avg_rating: 6.5, rating_count: 104
  },
  {
    name: "signup-flow-cro",
    slug: "signup-flow-cro",
    description: "Signup and registration flow optimization to reduce friction, increase completion rates, and boost activation.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/signup-flow-cro",
    category: "marketing",
    content: "# Signup Flow CRO\n\nSignup and registration flow optimization.\n\n## Features\n- Signup form friction analysis\n- Registration flow optimization\n- Completion rate improvement\n- Trial activation optimization\n\n## Use Cases\n- Reducing signup abandonment\n- Streamlining registration forms\n- Improving trial-to-paid conversion\n- A/B testing signup flows",
    install_command: "npx skills add coreyhaines31/marketingskills/signup-flow-cro",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5200, avg_rating: 6.5, rating_count: 104
  },
  {
    name: "brand-guidelines",
    slug: "brand-guidelines",
    description: "Apply official brand colors, typography, and design standards to artifacts for visual consistency.",
    author: "anthropics",
    source_url: "https://github.com/anthropics/skills/tree/main/skills/brand-guidelines",
    category: "implementation",
    content: "# Brand Guidelines\n\nBrand standards application for visual consistency.\n\n## Features\n- Brand color application\n- Typography standardization\n- Visual formatting consistency\n- Design system compliance\n\n## Use Cases\n- Applying company branding to documents\n- Ensuring design consistency\n- Creating branded materials\n- Style guide implementation",
    install_command: "npx skills add anthropics/skills/brand-guidelines",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5200, avg_rating: 6.5, rating_count: 104
  },
  {
    name: "expo-dev-client",
    slug: "expo-dev-client",
    description: "Development client setup and configuration for Expo apps with custom native module integration.",
    author: "expo",
    source_url: "https://github.com/expo/skills/tree/main/skills/expo-dev-client",
    category: "implementation",
    content: "# Expo Dev Client\n\nExpo development client configuration.\n\n## Features\n- Dev client setup and installation\n- Custom native module integration\n- Development build configuration\n- Debugging with dev client\n\n## Use Cases\n- Setting up Expo dev builds\n- Integrating custom native modules\n- Development environment configuration\n- Testing native features locally",
    install_command: "npx skills add expo/skills/expo-dev-client",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5200, avg_rating: 6.5, rating_count: 104
  },
  {
    name: "expo-tailwind-setup",
    slug: "expo-tailwind-setup",
    description: "Setting up Tailwind CSS with Expo and React Native using NativeWind for utility-first mobile styling.",
    author: "expo",
    source_url: "https://github.com/expo/skills/tree/main/skills/expo-tailwind-setup",
    category: "implementation",
    content: "# Expo Tailwind Setup\n\nTailwind CSS configuration for Expo/React Native.\n\n## Features\n- NativeWind installation and setup\n- Tailwind configuration for React Native\n- Platform-specific styling patterns\n- Dark mode support\n\n## Use Cases\n- Adding Tailwind to Expo projects\n- Utility-first mobile styling\n- Cross-platform style consistency",
    install_command: "npx skills add expo/skills/expo-tailwind-setup",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5100, avg_rating: 6.4, rating_count: 102
  },
  {
    name: "expo-deployment",
    slug: "expo-deployment",
    description: "Expo app deployment guide covering EAS Build, app store submission, OTA updates, and release management.",
    author: "expo",
    source_url: "https://github.com/expo/skills/tree/main/skills/expo-deployment",
    category: "implementation",
    content: "# Expo Deployment\n\nExpo app deployment and release management.\n\n## Features\n- EAS Build configuration\n- App store submission workflows\n- Over-the-air (OTA) updates\n- Release channel management\n- CI/CD integration\n\n## Use Cases\n- Deploying to App Store and Play Store\n- Setting up EAS Build\n- Managing OTA updates\n- Automating release pipelines",
    install_command: "npx skills add expo/skills/expo-deployment",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5100, avg_rating: 6.4, rating_count: 102
  },
  {
    name: "paywall-upgrade-cro",
    slug: "paywall-upgrade-cro",
    description: "Paywall and upgrade flow optimization for improving free-to-paid conversion rates.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/paywall-upgrade-cro",
    category: "marketing",
    content: "# Paywall Upgrade CRO\n\nPaywall and upgrade flow conversion optimization.\n\n## Features\n- Paywall design optimization\n- Upgrade prompt timing\n- Feature gating strategies\n- Conversion funnel analysis\n\n## Use Cases\n- Improving free-to-paid conversion\n- Designing effective paywalls\n- Optimizing upgrade prompts\n- Feature limit strategies",
    install_command: "npx skills add coreyhaines31/marketingskills/paywall-upgrade-cro",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5100, avg_rating: 6.4, rating_count: 102
  },
  {
    name: "referral-program",
    slug: "referral-program",
    description: "Referral program design and optimization for viral growth and word-of-mouth acquisition.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/referral-program",
    category: "marketing",
    content: "# Referral Program\n\nReferral program design for viral growth.\n\n## Features\n- Referral incentive design\n- Viral loop optimization\n- Tracking and attribution\n- A/B testing referral mechanics\n\n## Use Cases\n- Building referral systems\n- Optimizing word-of-mouth growth\n- Designing referral incentives\n- Measuring referral program ROI",
    install_command: "npx skills add coreyhaines31/marketingskills/referral-program",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5000, avg_rating: 6.3, rating_count: 100
  },
  {
    name: "form-cro",
    slug: "form-cro",
    description: "Form conversion rate optimization covering field reduction, validation UX, and multi-step form design.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/form-cro",
    category: "marketing",
    content: "# Form CRO\n\nForm conversion rate optimization.\n\n## Features\n- Field reduction analysis\n- Validation UX patterns\n- Multi-step form design\n- Error message optimization\n- Mobile form optimization\n\n## Use Cases\n- Improving form completion rates\n- Reducing form abandonment\n- Designing multi-step forms\n- Optimizing mobile forms",
    install_command: "npx skills add coreyhaines31/marketingskills/form-cro",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5000, avg_rating: 6.3, rating_count: 100
  },
  {
    name: "template-skill",
    slug: "template-skill",
    description: "Starter template for creating new agent skills with proper SKILL.md structure and YAML frontmatter.",
    author: "anthropics",
    source_url: "https://github.com/anthropics/skills/tree/main/skills/template-skill",
    category: "planning",
    content: "# Template Skill\n\nStarter template for creating new agent skills.\n\n## Structure\n- SKILL.md with YAML frontmatter\n- Description and trigger guidelines\n- Content organization patterns\n- Best practices for skill authoring\n\n## Use Cases\n- Starting a new skill from scratch\n- Following skill conventions\n- Learning skill structure\n- Bootstrapping custom skills",
    install_command: "npx skills add anthropics/skills/template-skill",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 5000, avg_rating: 6.3, rating_count: 100
  },
  {
    name: "popup-cro",
    slug: "popup-cro",
    description: "Popup and modal optimization for lead capture, announcements, and conversion with timing and targeting.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/popup-cro",
    category: "marketing",
    content: "# Popup CRO\n\nPopup and modal conversion optimization.\n\n## Features\n- Popup timing optimization\n- Targeting and segmentation\n- Exit-intent strategies\n- Design best practices\n- A/B testing popups\n\n## Use Cases\n- Optimizing lead capture popups\n- Reducing popup annoyance\n- Improving popup conversion rates\n- Designing exit-intent modals",
    install_command: "npx skills add coreyhaines31/marketingskills/popup-cro",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 4900, avg_rating: 6.2, rating_count: 98
  },
  {
    name: "ab-test-setup",
    slug: "ab-test-setup",
    description: "A/B testing setup and methodology covering hypothesis formation, statistical significance, and test design.",
    author: "coreyhaines31",
    source_url: "https://github.com/coreyhaines31/marketingskills/tree/main/skills/ab-test-setup",
    category: "marketing",
    content: "# A/B Test Setup\n\nA/B testing methodology and implementation.\n\n## Features\n- Hypothesis formation framework\n- Statistical significance calculation\n- Test duration estimation\n- Variant design patterns\n- Results analysis\n\n## Use Cases\n- Setting up A/B tests\n- Determining sample sizes\n- Designing test variants\n- Analyzing test results",
    install_command: "npx skills add coreyhaines31/marketingskills/ab-test-setup",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 4900, avg_rating: 6.2, rating_count: 98
  },
  {
    name: "internal-comms",
    slug: "internal-comms",
    description: "Internal communications templates for team updates, announcements, and organizational messaging.",
    author: "anthropics",
    source_url: "https://github.com/anthropics/skills/tree/main/skills/internal-comms",
    category: "implementation",
    content: "# Internal Comms\n\nInternal communications templates and patterns.\n\n## Features\n- Team update templates\n- Announcement formatting\n- Organizational messaging\n- Stakeholder communication\n\n## Use Cases\n- Writing team updates\n- Crafting announcements\n- Internal documentation\n- Cross-team communication",
    install_command: "npx skills add anthropics/skills/internal-comms",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 4900, avg_rating: 6.2, rating_count: 98
  },
  {
    name: "react-native-best-practices",
    slug: "react-native-best-practices",
    description: "React Native development best practices from Callstack covering architecture, performance, and native module integration.",
    author: "callstackincubator",
    source_url: "https://github.com/callstackincubator/agent-skills/tree/main/skills/react-native-best-practices",
    category: "implementation",
    content: "# React Native Best Practices\n\nComprehensive React Native development guide from Callstack.\n\n## Features\n- Architecture patterns\n- Performance optimization\n- Native module integration\n- Navigation patterns\n- State management\n- Testing strategies\n\n## Use Cases\n- Building production React Native apps\n- Optimizing app performance\n- Integrating native modules\n- Following industry best practices",
    install_command: "npx skills add callstackincubator/agent-skills/react-native-best-practices",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 4800, avg_rating: 6.2, rating_count: 96
  },
  {
    name: "finishing-a-development-branch",
    slug: "finishing-a-development-branch",
    description: "Structured completion workflow for development branches with test verification, merge/PR options, and cleanup.",
    author: "obra",
    source_url: "https://github.com/obra/superpowers/tree/main/skills/finishing-a-development-branch",
    category: "implementation",
    content: "# Finishing a Development Branch\n\nBranch completion and integration workflow.\n\n## Process\n1. Verify tests pass\n2. Present options (merge, PR, keep, discard)\n3. Execute chosen option\n4. Clean up worktree\n\n## Options\n- Merge back to base branch\n- Push and create Pull Request\n- Keep branch as-is\n- Discard work\n\n## Use Cases\n- Completing feature branches\n- Creating pull requests\n- Branch cleanup after merge",
    install_command: "npx skills add obra/superpowers/finishing-a-development-branch",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 4800, avg_rating: 6.2, rating_count: 96
  },
  {
    name: "expo-api-routes",
    slug: "expo-api-routes",
    description: "Expo API Routes for building server endpoints within Expo apps with file-based routing.",
    author: "expo",
    source_url: "https://github.com/expo/skills/tree/main/skills/expo-api-routes",
    category: "implementation",
    content: "# Expo API Routes\n\nServer endpoints within Expo apps.\n\n## Features\n- File-based API routing\n- Server-side request handling\n- Route parameter parsing\n- Middleware support\n- Authentication integration\n\n## Use Cases\n- Building API endpoints in Expo\n- Server-side data processing\n- Webhook handlers\n- Backend-for-frontend patterns",
    install_command: "npx skills add expo/skills/expo-api-routes",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 4800, avg_rating: 6.2, rating_count: 96
  },
  {
    name: "remembering-conversations",
    slug: "remembering-conversations",
    description: "Episodic memory and semantic search across archived conversations for recovering past decisions and solutions.",
    author: "obra",
    source_url: "https://github.com/obra/episodic-memory",
    category: "planning",
    content: "# Remembering Conversations\n\nSemantic search across archived conversations.\n\n## Core Principle\nSearch before reinventing.\n\n## Features\n- Semantic similarity search across archives\n- Exact text matching in conversation history\n- Local vector embedding generation\n- Past decision and pattern recovery\n- Multiple interfaces (CLI, MCP server, plugin)\n\n## Use Cases\n- Recovering past design decisions\n- Finding previous solutions to similar problems\n- Maintaining context across sessions\n- Building on previous work",
    install_command: "npx skills add obra/episodic-memory/remembering-conversations",
    version: "1.0.0", is_paid: false, price_cents: 0,
    install_count: 4800, avg_rating: 6.2, rating_count: 96
  }
];

async function main() {
  const seedPath = join(__dirname, 'seed-data.json');
  const existing = JSON.parse(await readFile(seedPath, 'utf-8'));
  const existingSlugs = new Set(existing.map(s => s.slug));

  let added = 0;
  for (const skill of newSkills) {
    if (!existingSlugs.has(skill.slug)) {
      existing.push(skill);
      added++;
    }
  }

  await writeFile(seedPath, JSON.stringify(existing, null, 2) + '\n');
  console.log(`Added ${added} new skills. Total: ${existing.length} skills.`);
}

main().catch(console.error);
