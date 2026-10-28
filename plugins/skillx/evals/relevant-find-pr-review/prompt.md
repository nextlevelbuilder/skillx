---
description: A plain skill-discovery request should trigger SkillX, search the catalog and compare candidates on provenance and risk.
tags: [relevant]
max_turns: 15
allowed_tools: [Read, Glob, Grep, Skill, mcp__plugin_skillx_skillx__search_packages, mcp__plugin_skillx_skillx__check_compatibility, mcp__plugin_skillx_skillx__get_release, mcp__plugin_skillx_skillx__get_package, WebFetch]
---

Find me an agent skill for reviewing pull requests and compare the top three options.
