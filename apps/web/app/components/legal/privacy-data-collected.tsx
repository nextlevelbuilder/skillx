/**
 * "What we collect" and "AI assistants" sections of the privacy policy.
 *
 * Each statement mirrors the code: the Better Auth tables and API key columns in
 * lib/db/schema.ts, install tracking in routes/api.skill-install.ts, usage
 * reports in routes/api.usage-report.ts, the IP-keyed limiter in
 * lib/releases/release-rate-limit.ts, and the anonymous MCP tools in
 * routes/api.mcp.ts. Change this text when that code changes.
 */

import { Link } from "react-router";
import { LegalSection } from "./legal-page";

export function PrivacyDataCollected() {
  return (
    <LegalSection id="data-we-collect" title="1. Personal data we collect">
      <p>
        <strong>GitHub sign-in.</strong> You sign in with GitHub. From GitHub we store your name, email
        address, profile image URL, and GitHub account ID, plus the OAuth access token GitHub issues
        (with its refresh token, expiry, and granted scope when GitHub provides them). Each sign-in
        creates a session record holding a session token (also set as a cookie in your browser), its
        expiry, and the IP address and browser user agent recorded at sign-in.
      </p>
      <p>
        <strong>API keys.</strong> When you create a key in{" "}
        <Link to="/settings" className="text-sx-accent hover:underline">settings</Link>, we show the key
        once and store only its SHA-256 hash, its first 8 characters, the name you gave it, its scopes,
        and when it was created, last used, and revoked. We never store the plaintext key.
      </p>
      <p>
        <strong>Content and activity you create.</strong> Ratings, reviews, favorites, and up/down
        votes on skills; collections, personal kits, publisher handles, and skills or releases you
        publish. Each is linked to your account ID. Reviews are public and shown with the first
        8 characters of your account ID.
      </p>
      <p>
        <strong>Install tracking.</strong> When the <code className="font-mono text-xs">skillx</code> CLI
        fetches a skill (for example with <code className="font-mono text-xs">skillx use</code>), it
        reports the install with a random device ID that the CLI generates on first use and keeps in its
        local config, plus your API key if you configured one. We store the skill, the time, and either
        your account ID (when the key is valid) or the device ID, once per skill per account or device,
        to count installs.
      </p>
      <p>
        <strong>Usage reports.</strong> Only when you run{" "}
        <code className="font-mono text-xs">skillx report</code> with an API key: the skill, the outcome
        (success, failure, or partial), and optionally the model name and duration you pass, linked to
        your account ID.
      </p>
      <p>
        <strong>Search queries.</strong> A query is used to compute results and is not written to our
        database or cache. Its text is sent to Cloudflare Workers AI to compute a search embedding. When
        you are signed in, your account ID is used only to mark which results you have favorited.
      </p>
      <p>
        <strong>Technical data.</strong> For anonymous requests to the MCP endpoint and the release API,
        your IP address is used as the key of a rate limiter that counts requests in memory for
        60 seconds; SkillX does not store it. Our hosting provider, Cloudflare, also records request
        logs (such as the URL, time, and error messages) for operating and debugging the service.
      </p>
      <p>
        <strong>What we do not collect.</strong> We run no advertising or third-party analytics scripts,
        and the only cookies we set are the ones used for signing in. We do not sell personal data.
      </p>
    </LegalSection>
  );
}

export function PrivacyAiAssistants() {
  return (
    <LegalSection id="ai-assistants" title="4. AI assistants (ChatGPT, MCP clients)">
      <p>
        AI assistants such as ChatGPT reach SkillX through our remote MCP endpoint at{" "}
        <code className="font-mono text-xs">/api/mcp</code>. Searching, reading a package or release,
        and checking compatibility run anonymously: SkillX does not read any session or API key on
        those calls and does not receive your identity from the assistant.
      </p>
      <ul>
        <li>
          SkillX receives only the arguments the assistant sends to a tool, such as a search query or a
          package name. It does not receive your conversation with the assistant.
        </li>
        <li>
          A search query sent this way is handled like any other search: it is used to compute results,
          is not stored in our database or cache, and its text is sent to Cloudflare Workers AI for a
          search embedding.
        </li>
        <li>
          Your IP address (as seen by SkillX, which may be the assistant provider&apos;s server) is used
          only for in-memory rate limiting, and the request appears in Cloudflare&apos;s request logs.
        </li>
        <li>
          The one exception is reading a personal kit: it uses your SkillX API key or session, if the
          client sends one, so you can read your own private kit.
        </li>
      </ul>
      <p>
        What the assistant provider does with your conversation is governed by that provider&apos;s
        own privacy policy.
      </p>
    </LegalSection>
  );
}
