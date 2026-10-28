# Security policy

## Reporting a vulnerability

Do not put exploit details, credentials or personal data in a public issue.

1. If the repository's **Security → Report a vulnerability** button is available,
   use it to open a private advisory.
2. Otherwise, open an issue titled `security: private contact requested` with no
   details beyond the affected area (web app, API, CLI, Claude plugin, ChatGPT plugin). A
   maintainer will reply with a private channel.

Include the affected component and version, steps to reproduce, and the impact.

## Scope

- `skillx.sh` web app and APIs (`apps/web`)
- The `skillx-sh` npm CLI (`packages/cli`)
- The SkillX Claude plugin (`plugins/skillx`)
- The SkillX ChatGPT plugin (`integrations/chatgpt-plugin`)

Skills listed in the catalog are written by third parties. To report a
malicious catalog skill, open an issue with its slug.
