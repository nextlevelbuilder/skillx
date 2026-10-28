/** Support page: where to get help, report a security issue or a malicious skill, and request data deletion. */

import { Link, type MetaFunction } from "react-router";
import {
  ExternalLink,
  LegalPage,
  LegalSection,
  SECURITY_ADVISORY_URL,
  SUPPORT_ISSUES_URL,
} from "../components/legal/legal-page";

export const meta: MetaFunction = () => [
  { title: "Support — SkillX.sh" },
  {
    name: "description",
    content:
      "Get help with SkillX.sh: GitHub issues, security reports, reporting a malicious skill, documentation, and account or data deletion.",
  },
];

const LINK = "text-sx-accent hover:underline";

const DOCS = [
  { to: "/docs", label: "CLI Guide" },
  { to: "/docs/agents", label: "Coding Agents Guide" },
  { to: "/docs/api", label: "API Reference" },
] as const;

export default function Support() {
  return (
    <LegalPage
      title="Support"
      intro={
        <p>
          SkillX support runs through GitHub. Open an issue for questions, bugs, and requests; use a private
          security report for anything that should not be public.
        </p>
      }
    >
      <LegalSection id="get-help" title="Get help">
        <p>
          Open an issue on <ExternalLink href={SUPPORT_ISSUES_URL}>github.com/nextlevelbuilder/skillx/issues</ExternalLink>.
          Search existing issues first, and include the command or page you used, what you expected, and what
          happened. Never paste an API key or other secret into an issue.
        </p>
      </LegalSection>

      <LegalSection id="docs" title="Documentation">
        <ul>
          {DOCS.map((doc) => (
            <li key={doc.to}>
              <Link to={doc.to} className={LINK}>
                {doc.label}
              </Link>
            </li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection id="security" title="Report a security vulnerability">
        <p>
          Report vulnerabilities in SkillX itself privately through GitHub&apos;s private vulnerability
          reporting: <ExternalLink href={SECURITY_ADVISORY_URL}>open a security advisory</ExternalLink> (the
          Security tab of nextlevelbuilder/skillx). Do not put vulnerability details in a public issue. If
          that form is unavailable, open an issue titled{" "}
          <code className="font-mono text-xs">security: private contact requested</code> naming only the
          affected area, and a maintainer will reply with a private channel.
        </p>
      </LegalSection>

      <LegalSection id="malicious-skill" title="Report a malicious or harmful skill">
        <p>
          If a listed skill contains malware, prompt injection, credential theft, or other harmful content,
          open an issue on our <ExternalLink href={SUPPORT_ISSUES_URL}>issue tracker</ExternalLink> with the
          skill&apos;s URL (<code className="font-mono text-xs">https://skillx.sh/skills/&lt;slug&gt;</code>) and
          what you found. If publishing the details would help an attacker, send them through a{" "}
          <ExternalLink href={SECURITY_ADVISORY_URL}>private security report</ExternalLink> instead.
        </p>
        <p>
          Note: the CLI command <code className="font-mono text-xs">skillx report</code> records a usage
          outcome (success, failure, partial) for ranking. It does not report abuse.
        </p>
      </LegalSection>

      <LegalSection id="data-requests" title="Account and data deletion">
        <p>
          To delete your account and the data linked to it, remove a review, or get a copy of your data,
          open an issue on our <ExternalLink href={SUPPORT_ISSUES_URL}>issue tracker</ExternalLink> from the
          GitHub account you sign in to SkillX with, so we can match the request to your account. Do not include
          other personal data in the issue. You can revoke API keys yourself at any time in{" "}
          <Link to="/settings" className={LINK}>settings</Link>. See the{" "}
          <Link to="/privacy" className={LINK}>Privacy Policy</Link> for what we store.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
