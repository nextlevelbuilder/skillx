import type { MetaFunction } from "react-router";
import { LegalPage, SUPPORT_ISSUES_URL, type LegalSection } from "../components/legal/legal-page";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — SkillX.sh" },
  { name: "description", content: "What SkillX.sh collects, why, who processes it, and how to get it deleted." },
];

const SECTIONS: LegalSection[] = [
  {
    heading: "What we collect",
    items: [
      "Account data when you sign in with GitHub: your GitHub name, email address, avatar URL and the OAuth account link needed to keep you signed in.",
      "Session data: a session cookie, plus the IP address and user agent recorded with each sign-in session.",
      "API keys you create: we store only a SHA-256 hash and a short prefix, never the key itself.",
      "Things you choose to post: ratings, reviews (shown publicly), votes, favorites, collections, kits and packages you publish.",
      "Install and usage reports sent by the skillx CLI: the skill, your account or a random device ID the CLI generates, and for usage reports the model, outcome and duration.",
      "Search queries, which are embedded with Cloudflare Workers AI to rank results and cached for a few minutes to keep search fast.",
    ],
  },
  {
    heading: "SkillX in ChatGPT and other MCP clients",
    paragraphs: [
      "The SkillX ChatGPT plugin and the public MCP endpoint (https://skillx.sh/api/mcp) are read-only and anonymous. They receive the search terms, skill names and versions the assistant sends, and the IP address of the calling service, which is used only for rate limiting. These requests are not linked to a SkillX account, and nothing is installed or run on your behalf.",
      "Your conversation with the assistant stays with the assistant provider; SkillX only sees the tool calls it makes.",
    ],
  },
  {
    heading: "How we use it",
    items: [
      "To run the catalog: search, skill pages, ratings, leaderboards and install counts.",
      "To authenticate you and your API keys, and to protect the service with rate limits and abuse checks.",
      "To keep an audit trail of publishing and moderation actions on packages.",
    ],
    paragraphs: ["We do not sell personal data, show ads, or use it to build advertising profiles."],
  },
  {
    heading: "Who processes it",
    items: [
      "Cloudflare hosts SkillX (Workers, D1, KV, R2, Workers AI and rate limiting) and therefore processes every request.",
      "GitHub processes sign-in when you choose to log in with GitHub.",
    ],
  },
  {
    heading: "Cookies",
    paragraphs: [
      "SkillX sets only the session cookie needed to keep you signed in. There are no analytics or advertising cookies.",
    ],
  },
  {
    heading: "Retention and deletion",
    paragraphs: [
      "Account data is kept while your account exists. Sessions expire on their own, revoked API keys stop working immediately, and search caches expire within minutes.",
      `To export or delete your data, or to ask a privacy question, open a request through ${SUPPORT_ISSUES_URL} (do not post personal details publicly; say you need a private channel and we will follow up). Published packages may be retained in the immutable release log for integrity, but are delisted on request.`,
    ],
  },
  {
    heading: "Changes",
    paragraphs: ["We will update this page and its date when the policy changes."],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 28, 2026"
      intro="SkillX.sh is a catalog and registry of AI agent skills. This page explains what personal data it handles and why."
      sections={SECTIONS}
    />
  );
}
