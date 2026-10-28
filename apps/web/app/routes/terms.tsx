/** Terms of service: concise marketplace terms for skills authored by third parties. */

import { Link, type MetaFunction } from "react-router";
import { ExternalLink, LegalPage, LegalSection, SUPPORT_ISSUES_URL } from "../components/legal/legal-page";

export const meta: MetaFunction = () => [
  { title: "Terms of Service — SkillX.sh" },
  {
    name: "description",
    content:
      "Terms for using SkillX.sh: third-party skills, risk labels as signals, acceptable use, no warranty, and limitation of liability.",
  },
];

const LINK = "text-sx-accent hover:underline";

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms apply to the SkillX.sh website, API, <code className="font-mono text-xs">skillx</code> CLI,
          and remote MCP endpoint (together, &quot;SkillX&quot;). By using SkillX you agree to them.
        </p>
      }
    >
      <LegalSection id="third-party-skills" title="1. Skills are third-party content">
        <p>
          Skills, kits, and releases listed on SkillX are written and published by their publishers, not
          by SkillX. Publishers are responsible for what they publish and must have the right to publish it
          under the license they state.
        </p>
        <p>
          SkillX does not guarantee that any skill is safe, correct, or fit for a particular purpose. A
          skill is instructions and code that an AI agent may follow or run on your machine with your
          permissions.
        </p>
      </LegalSection>

      <LegalSection id="signals" title="2. Risk labels and rankings are signals, not endorsements">
        <ul>
          <li>
            Risk labels (safe, caution, danger, unknown) come from automated scans of skill content. A scan
            can miss harmful content and can flag harmless content. A label is a signal, not a
            certification or endorsement.
          </li>
          <li>
            Ratings, installs, votes, and leaderboard position measure popularity. Popularity is not
            safety.
          </li>
          <li>Compatibility declarations are made by publishers; &quot;declared&quot; is not &quot;verified&quot;.</li>
        </ul>
      </LegalSection>

      <LegalSection id="your-responsibility" title="3. Review before you install or run">
        <p>
          Read a skill and any scripts it ships before you install it, give it to an AI agent, or run it.
          You are responsible for what you choose to install and run, and for the actions your agents take.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="4. Accounts and API keys">
        <p>
          You sign in with GitHub. Keep your API keys secret and revoke a key in{" "}
          <Link to="/settings" className={LINK}>settings</Link> if it may be exposed. You are responsible for
          activity under your account and keys.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="5. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>publish malware, credential stealers, prompt injection, or content designed to harm users or their systems;</li>
          <li>publish content you have no right to, or that infringes others&apos; rights;</li>
          <li>impersonate another person, publisher, or project;</li>
          <li>manipulate ratings, votes, reviews, installs, or rankings;</li>
          <li>circumvent rate limits, authentication, or access controls, or overload the service;</li>
          <li>use SkillX for anything unlawful.</li>
        </ul>
        <p>
          We may remove or hide content, quarantine releases, and suspend accounts or keys that break these
          rules or put users at risk.
        </p>
      </LegalSection>

      <LegalSection id="no-warranty" title="6. No warranty">
        <p>
          SkillX is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, express or
          implied, including merchantability, fitness for a particular purpose, and non-infringement. We do
          not guarantee that SkillX will be uninterrupted, error-free, or that its data is accurate.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="7. Limitation of liability">
        <p>
          To the maximum extent permitted by law, SkillX and its maintainers are not liable for any
          indirect, incidental, special, consequential, or punitive damages, or for loss of data, profits,
          or systems, arising from your use of SkillX or of any skill obtained through it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="8. Changes">
        <p>
          We may change these terms. We will update this page and its &quot;Last updated&quot; date; continued use
          after a change means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="9. Contact">
        <p>
          Questions about these terms go to our <ExternalLink href={SUPPORT_ISSUES_URL}>GitHub issue tracker</ExternalLink>.
          See also the <Link to="/privacy" className={LINK}>Privacy Policy</Link> and{" "}
          <Link to="/support" className={LINK}>Support</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
