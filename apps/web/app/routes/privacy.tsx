/**
 * Privacy policy. Every claim must be checkable against the code; see the
 * header of components/legal/privacy-data-collected.tsx for the sources.
 * Where the code enforces no retention limit, the text says so.
 */

import { Link, type MetaFunction } from "react-router";
import { ExternalLink, LegalPage, LegalSection, SUPPORT_ISSUES_URL } from "../components/legal/legal-page";
import { PrivacyAiAssistants, PrivacyDataCollected } from "../components/legal/privacy-data-collected";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — SkillX.sh" },
  {
    name: "description",
    content:
      "What personal data SkillX.sh collects, why, who processes it, how long it is kept, and how to control or delete it.",
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy covers the SkillX.sh website, its API, the <code className="font-mono text-xs">skillx</code>{" "}
          CLI, and the remote MCP endpoint used by AI assistants. It describes what we actually collect,
          as implemented in the open-source code of SkillX.
        </p>
      }
    >
      <PrivacyDataCollected />

      <LegalSection id="how-we-use" title="2. How we use it">
        <ul>
          <li>To sign you in and keep you signed in, and to authenticate API keys.</li>
          <li>
            To check, with your GitHub token, that you have write access to a repository before you
            register or publish a skill from it.
          </li>
          <li>To show and count ratings, reviews, favorites, votes, collections, and kits.</li>
          <li>To rank skills: installs, usage reports, ratings, and votes feed leaderboard and search scores.</li>
          <li>To limit abusive request rates and to operate, debug, and secure the service.</li>
        </ul>
      </LegalSection>

      <LegalSection id="recipients" title="3. Who receives it">
        <ul>
          <li>
            <strong>Cloudflare</strong> hosts and processes everything as our infrastructure provider:
            Workers (application and request logs), D1 (database), KV (short-lived cache), R2 (release
            files), Vectorize (search index), Workers AI (embeddings of public skill text and of search
            queries), and rate limiting. Cloudflare operates a global network, so data may be processed
            outside your country.
          </li>
          <li>
            <strong>GitHub</strong> is the sign-in provider. We call the GitHub API with your token to
            check repository permissions, and fetch public repository content when skills are registered.
          </li>
          <li>
            <strong>The public</strong> sees what you publish: reviews (with a shortened account ID),
            aggregate ratings and votes, publisher handles, published skills and releases, and
            collections you make public or unlisted.
          </li>
        </ul>
        <p>We do not sell or rent personal data or share it for advertising.</p>
      </LegalSection>

      <PrivacyAiAssistants />

      <LegalSection id="retention" title="5. How long we keep it">
        <ul>
          <li>
            <strong>Account, GitHub token, and content you create</strong> (ratings, reviews, favorites,
            votes, collections, kits, publisher records): kept while your account exists. No automatic
            deletion is in place; ask us to delete them (see below).
          </li>
          <li>
            <strong>Sessions</strong> stop working 7 days after they were last refreshed; session records
            may remain until your account is deleted.
          </li>
          <li>
            <strong>API keys</strong>: a revoked key can no longer be used; its hash and metadata stay on
            record with the revocation time until your account is deleted.
          </li>
          <li>
            <strong>Install records and usage reports</strong> are kept as ranking signals with no
            automatic expiry.
          </li>
          <li>
            <strong>Search queries</strong> are not retained by SkillX. Rate-limit counters last
            60 seconds in memory. Cached leaderboard data expires after 5 minutes.
          </li>
          <li>
            <strong>Request logs</strong> are kept by Cloudflare for its Workers Logs retention period,
            measured in days.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="your-controls" title="6. Your choices and controls">
        <ul>
          <li>
            Revoke API keys at any time in <Link to="/settings" className="text-sx-accent hover:underline">settings</Link>.
          </li>
          <li>Remove favorites and clear votes on the skill page; change your rating at any time.</li>
          <li>Sign out to end your browser session.</li>
          <li>
            Revoke SkillX&apos;s access to your GitHub account in GitHub under Settings → Applications →
            Authorized OAuth Apps.
          </li>
          <li>Delete the CLI&apos;s local config to discard its device ID; a new random one is created on next use.</li>
          <li>
            To delete your account and the data linked to it, remove a review, or get a copy of your data,
            open an issue on our <ExternalLink href={SUPPORT_ISSUES_URL}>GitHub issue tracker</ExternalLink>{" "}
            from the GitHub account you sign in with. Do not post other personal data in the issue. See{" "}
            <Link to="/support" className="text-sx-accent hover:underline">Support</Link>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="security" title="7. Security">
        <p>
          The site is served over HTTPS. API keys are stored as SHA-256 hashes, and session cookies
          are managed by our authentication library. No system is perfectly secure; report a
          vulnerability as described on the <Link to="/support" className="text-sx-accent hover:underline">Support</Link> page.
        </p>
      </LegalSection>

      <LegalSection id="children" title="8. Children">
        <p>SkillX is a developer tool and is not directed to children under 13. We do not knowingly collect their data.</p>
      </LegalSection>

      <LegalSection id="changes" title="9. Changes and contact">
        <p>
          We will update this page and its &quot;Last updated&quot; date when our practices change. Questions
          and requests go to our <ExternalLink href={SUPPORT_ISSUES_URL}>GitHub issue tracker</ExternalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
