import type { MetaFunction } from "react-router";
import { LegalPage, SUPPORT_ISSUES_URL, type LegalSection } from "../components/legal/legal-page";

export const meta: MetaFunction = () => [
  { title: "Support — SkillX.sh" },
  { name: "description", content: "How to get help with SkillX.sh, the skillx CLI, the MCP server and the ChatGPT plugin." },
];

const SECTIONS: LegalSection[] = [
  {
    heading: "Get help",
    items: [
      `Bugs, questions and feature requests: open an issue at ${SUPPORT_ISSUES_URL}.`,
      "Include what you ran or asked (a CLI command, an MCP tool call or a ChatGPT prompt), what you expected, and what happened. Never paste an API key.",
      "Guides: https://skillx.sh/docs, including the ChatGPT plugin guide at https://skillx.sh/docs/chatgpt.",
    ],
  },
  {
    heading: "Report a security vulnerability",
    paragraphs: [
      "Do not put exploit details in a public issue. Follow the security policy at https://github.com/nextlevelbuilder/skillx/blob/main/SECURITY.md to open a private report.",
    ],
  },
  {
    heading: "Report a harmful skill",
    paragraphs: [
      "If a listed skill looks malicious, steals credentials, hides instructions or infringes your rights, open an issue naming the skill page URL and what you found. Do not run the skill to prove it. Reported packages can be quarantined while they are reviewed.",
    ],
  },
  {
    heading: "Privacy and account requests",
    paragraphs: [
      "For data export or deletion, open an issue saying you need a private channel, without personal details, and we will follow up. See the privacy policy at https://skillx.sh/privacy.",
    ],
  },
];

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      updated="October 28, 2026"
      intro="SkillX.sh is maintained in the open. Support runs through the public issue tracker."
      sections={SECTIONS}
    />
  );
}
