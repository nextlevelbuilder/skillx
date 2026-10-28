---
name: setup
description: First-run orientation for the SkillX plugin. Use when the user has just added SkillX, asks what it can do, or asks how to start finding agent skills with it.
---

# SkillX setup

SkillX needs no account, sign-in or API key: every tool reads the public catalog
anonymously. There is nothing to configure.

Tell the user, in a few sentences:

1. **What it does.** Searches the SkillX.sh catalog of agent skills (SKILL.md packages)
   and explains each result's publisher, source, release pin, runtime compatibility and
   security scan state.
2. **What it does not do.** It never installs, enables or runs a skill, and ChatGPT
   cannot install third-party skills through it. Adopting a skill is a step the user
   takes in their own agent host after reviewing it.
3. **How to start.** Offer two example requests, for example:
   - "Find a skill for reviewing pull requests in Codex."
   - "Compare the top two SkillX skills for PDF extraction and tell me which is safer."
4. **How to read results.** Popularity is not safety; `unknown` compatibility is not
   support; an unpinned listing can change after you review it.

Then hand over to the `skillx-discovery` skill for the user's first request.
