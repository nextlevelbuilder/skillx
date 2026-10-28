import type { MetaFunction } from "react-router";
import { LegalPage, type LegalSection } from "../components/legal/legal-page";

export const meta: MetaFunction = () => [
  { title: "Terms of Service — SkillX.sh" },
  { name: "description", content: "The terms for using the SkillX.sh catalog, API, CLI, MCP server and ChatGPT plugin." },
];

const SECTIONS: LegalSection[] = [
  {
    heading: "The service",
    paragraphs: [
      "SkillX.sh lists AI agent skills, most of them written and hosted by third parties, and offers a website, an HTTP API, the skillx CLI, a read-only MCP server and a ChatGPT plugin to discover them. These terms apply to all of them.",
    ],
  },
  {
    heading: "Third-party skills",
    items: [
      "SkillX does not write, own or endorse listed skills. Each listing names its publisher and source; the publisher's own license applies to the skill.",
      "Risk labels, compatibility statuses and release states are automated signals, not a security audit. Ratings, installs and votes measure popularity, not safety.",
      "A skill can contain instructions or scripts that act on your machine and data. Review a skill and its source before you install or run it; you are responsible for what you choose to install.",
      "Discovery never installs or runs anything. Installing happens only when you take that step yourself in a supported tool.",
    ],
  },
  {
    heading: "Your account and content",
    items: [
      "Keep your API keys secret; you are responsible for activity under your account and keys.",
      "Ratings, reviews and other content you post must be honest and lawful. You grant SkillX the right to display it on the service.",
      "Publishers must have the right to distribute what they publish and must not publish malware, credential theft, hidden prompt injection or content that infringes others' rights.",
    ],
  },
  {
    heading: "Acceptable use",
    items: [
      "Do not bypass rate limits, scrape in ways that degrade the service, probe for other users' private packages, or use SkillX to distribute harmful software.",
      "We may quarantine, delist or remove packages, and suspend accounts or publishers, to protect users or comply with the law.",
    ],
  },
  {
    heading: "No warranty and limitation of liability",
    paragraphs: [
      "SkillX is provided \"as is\" without warranties of any kind. To the extent the law allows, SkillX and its operators are not liable for indirect or consequential damages, or for harm caused by third-party skills you choose to install or run.",
    ],
  },
  {
    heading: "Changes",
    paragraphs: [
      "We may change the service or these terms. Material changes are announced on this page with a new date; continuing to use SkillX after that means you accept them.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="October 28, 2026"
      intro="By using SkillX.sh you agree to these terms. If you do not agree, do not use the service."
      sections={SECTIONS}
    />
  );
}
