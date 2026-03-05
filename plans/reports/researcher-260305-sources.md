# Research Sources & References

**Compiled:** March 5, 2026
**Research Period:** 2024-2026 prompt injection defense landscape

All sources have been accessed and verified to be active as of March 2026.

---

## Standards & Guidelines

### OWASP (Official)
- [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) — Primary vulnerability definition, OWASP Top 10 for LLM Applications 2025
- [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) — Practical mitigation strategies and recommendations
- [OWASP Top 10 for LLM Applications 2025 (PDF)](https://owasp.org/www-project-top-10-for-large-language-model-applications/assets/PDF/OWASP-Top-10-for-LLMs-v2025.pdf) — Full 2025 update with LLM01 context
- [OWASP: Prompt Injection (General Wiki)](https://owasp.org/www-community/attacks/PromptInjection) — Foundational definition

---

## Academic & Peer-Reviewed Research

### 2025-2026 Key Papers (Preprints & Published)

- [**arXiv:2601.17548** - Prompt Injection Attacks on Agentic Coding Assistants: A Systematic Analysis of Vulnerabilities in Skills, Tools, and Protocol Ecosystems](https://arxiv.org/abs/2601.17548) ⭐ **PRIMARY SOURCE**
  - Systematic analysis of GitHub Copilot, Cursor, Claude Code
  - 42 distinct attack techniques documented
  - Attack success rates: 85%+ with adaptive strategies
  - HTML version: https://arxiv.org/html/2601.17548v1

- [**arXiv:2602.14211** - SkillJect: Automating Stealthy Skill-Based Prompt Injection for Coding Agents with Trace-Driven Closed-Loop Refinement](https://arxiv.org/html/2602.14211) ⭐ **SKILLS-SPECIFIC**
  - Automated attack generation for AI agent skills
  - Trace-driven refinement methodology
  - Success rate improvements through iteration

- [**MDPI 2025** - Prompt Injection Attacks in Large Language Models and AI Agent Systems: A Comprehensive Review of Vulnerabilities, Attack Vectors, and Defense Mechanisms](https://www.mdpi.com/2078-2489/17/1/54)
  - Comprehensive taxonomy of vulnerabilities
  - Defense effectiveness analysis
  - 78-paper meta-analysis of defense approaches

- [**Preprints.org 2025** - Prompt Injection Attacks in Large Language Models and AI Agent Systems](https://www.preprints.org/manuscript/202511.0088)
  - Technical deep-dive
  - Attack classification
  - Defense evaluation

---

## Industry Security Research

### Snyk (Supply Chain Security) ⭐ **EMPIRICAL DATA**
- [**ToxicSkills Study** - Snyk Blog](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/)
  - Survey of 3,980 AI agent skills
  - **36.82% have ≥1 security flaw** (1,467 skills)
  - **13.4% are critical** (534 skills)
  - ClawHavoc campaign: 1,184 malicious skills in 2 weeks
  - Most common: prompt injection (32%), exposed credentials (24%)

### Palo Alto Networks Unit 42 ⭐ **REAL-WORLD INCIDENTS**
- [Fooling AI Agents: Web-Based Indirect Prompt Injection Observed in the Wild](https://unit42.paloaltonetworks.com/ai-agent-prompt-injection/)
  - Cline/OpenClaw supply chain attack (Feb 2026)
  - 4,000+ developer machines compromised
  - CamoLeak attack methodology
  - Reprompt (CVE-2026-24307) single-click exfiltration
  - Real attack chain analysis

- [New Prompt Injection Attack Vectors Through MCP Sampling](https://unit42.paloaltonetworks.com/model-context-protocol-attack-vectors/)
  - MCP-specific attack vectors
  - Tool poisoning techniques
  - Sampling vulnerabilities

### Microsoft / Azure Security ⭐ **DEFENSE STRATEGY**
- [How Microsoft Defends Against Indirect Prompt Injection Attacks](https://www.microsoft.com/en-us/msrc/blog/2025/07/how-microsoft-defends-against-indirect-prompt-injection-attacks)
  - Azure Prompt Shield methodology
  - Multi-layer encoding detection
  - Practical defense implementation
  - 85-90% effectiveness against known encodings

### eSentire (Managed Security)
- [Model Context Protocol Security: Critical Vulnerabilities Every CISO Must Address in 2025](https://www.esentire.com/blog/model-context-protocol-security-critical-vulnerabilities-every-ciso-should-address-in-2025/)
  - MCP vulnerability landscape
  - CISO-focused threat summary
  - Risk prioritization

### AuthZed (Access Control)
- [A Timeline of Model Context Protocol (MCP) Security Breaches](https://authzed.com/blog/timeline-mcp-breaches/)
  - Chronological incident log
  - MCP breach patterns
  - Evolution of attacks 2024-2026

### CatoNetworks (Network Security)
- [HashJack - First Known Indirect Prompt Injection](https://www.catonetworks.com/blog/cato-ctrl-hashjack-first-known-indirect-prompt-injection/)
  - URL-based indirect injection
  - Phishing + data theft chain
  - Network-level detection possibilities

### Vectra AI (Behavioral Analytics)
- [Prompt Injection: Types, Real-World CVEs, and Enterprise Defenses](https://www.vectra.ai/topics/prompt-injection)
  - CVE enumeration
  - Defense effectiveness analysis
  - Enterprise context

### Obsidian Security (AI Security)
- [Prompt Injection Attacks: The Most Common AI Exploit in 2025](https://www.obsidiansecurity.com/blog/prompt-injection)
  - 2025 threat landscape
  - Exploitation statistics
  - Defense recommendations

### NCSC.GOV.UK (UK National Cyber Security Centre) ⭐ **OFFICIAL GUIDANCE**
- [Prompt Injection is Not SQL Injection (It May Be Worse)](https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection)
  - UK government perspective
  - Why prompt injection is fundamentally different
  - Risk assessment for government AI use

---

## Unicode & Character-Based Attacks

### Promptfoo ⭐ **PRACTICAL TESTING**
- [The Invisible Threat: How Zero-Width Unicode Characters Can Silently Backdoor Your AI-Generated Code](https://www.promptfoo.dev/blog/invisible-unicode-threats/)
  - Zero-width character attack demonstrations
  - Detection success rates (~80% evasion)
  - Real-world examples

### Cisco (Network Security)
- [Understanding and Mitigating Unicode Tag Prompt Injection](https://blogs.cisco.com/ai/understanding-and-mitigating-unicode-tag-prompt-injection/)
  - Unicode tag vulnerability analysis
  - Detection mechanisms
  - Mitigation strategies

### Embrace The Red (Red Team Research)
- [Scary Agent Skills: Hidden Unicode Instructions in Skills ...And How To Catch Them](https://embracethered.com/blog/posts/2026/scary-agent-skills/)
  - Hidden Unicode in real-world skills
  - Detection toolkit
  - Case studies

### Prompt Security
- [Unicode Exploits Are Compromising Application Security](https://prompt.security/blog/unicode-exploits-are-compromising-application-security/)
  - Unicode attack vectors
  - Exploitation techniques

### GitHub Research Repository
- [unicode-injection - Proof of Concept](https://github.com/0x6f677548/unicode-injection)
  - Working PoC for Unicode injection
  - Reference implementation

---

## API Key & Secrets Exfiltration

### CVE-2025-68664: LangChain Deserialization RCE ⭐ **CRITICAL VULNERABILITY**
- [Cyata: LangGrinch Hits LangChain Core](https://cyata.ai/blog/langgrinch-langchain-core-cve-2025-68664/)
  - Full CVE analysis
  - Attack mechanics explanation
  - Environment variable exfiltration

- [CVE-2025-68664 - Miggo Vulnerability Database](https://www.miggo.io/vulnerability-database/cve/CVE-2025-68664)
  - Official vulnerability entry
  - Affected versions
  - Patches and workarounds

- [LangChain Security Advisory - GitHub](https://github.com/langchain-ai/langchainjs/security/advisories/GHSA-r399-636x-v7f6)
  - Official LangChain response
  - Patch information
  - Recommended mitigations

- [The "lc" Leak: Critical 9.3 Severity LangChain Flaw](https://securityonline.info/the-lc-leak-critical-9-3-severity-langchain-flaw-turns-prompt-injections-into-secret-theft/)
  - Impact analysis
  - Exploitation scenarios

### General Secrets Management
- [Stop Storing LLM API Keys in Plaintext `.env` Files — Introducing LLM Key Ring (lkr)](https://dev.to/yotta/stop-storing-llm-api-keys-in-plaintext-env-files-introducing-llm-key-ring-lkr-4mle) ⭐ **PRACTICAL TOOL**
  - TTY-based output filtering
  - Prevention of pipe exfiltration
  - Production-ready approach

- [Securing AI Agents and LLM Workflows Without Secrets](https://securityboulevard.com/2025/09/securing-ai-agents-and-llm-workflows-without-secrets/)
  - Architecture for secret-less agents
  - Workload identity approach
  - Long-term solutions

- [AI Agents Don't Understand Secrets. That's Your Problem.](https://dev.to/0x711/ai-agents-dont-understand-secrets-thats-your-problem-43n4)
  - Root cause analysis
  - Design implications
  - Solutions discussion

---

## Content Sanitization & Filtering

### Mozilla Bleach ⭐ **STANDARD LIBRARY**
- [GitHub: mozilla/bleach](https://github.com/mozilla/bleach)
  - Official Bleach repository
  - Whitelist-based HTML sanitizer
  - Python implementation

- [Bleach Documentation (Latest)](https://bleach.readthedocs.io/en/latest/)
  - Complete API reference
  - Usage examples
  - Security best practices

- [PyPI: bleach](https://pypi.org/project/bleach/)
  - Package information
  - Version history
  - Installation instructions

### Bleach + Markdown Integration
- [mdx_bleach - Python-Markdown Extension](https://github.com/Wenzil/mdx_bleach)
  - Markdown + Bleach combination
  - Removes dangerous HTML from markdown output
  - Production-ready

- [Securing Markdown User Content with Mozilla Bleach](https://blog.rubenwardy.com/2021/05/08/mozilla-bleach-markdown/)
  - Practical integration guide
  - Security considerations
  - Real-world example

### General HTML Sanitization
- [How to Safely Sanitize HTML Before Rendering (ButterCMS)](https://buttercms.com/knowledge-base/html-sanitization-best-practices/)
  - Best practices overview
  - Library comparison
  - Framework-specific guidance

---

## Boundary Markers & Structural Defense

### XML & Delimiter Testing
- [Testing Common Prompt Injection Defenses: XML vs. Markdown and System vs. User Prompts](https://schneidenba.ch/testing-llm-prompt-injection-defenses/) ⭐ **EMPIRICAL TESTING**
  - Spencer Schneidenbach's research
  - XML vs. Markdown effectiveness
  - System vs. user prompt placement
  - Real test results

- [Effective Prompt Engineering: Mastering XML Tags for Clarity, Precision, and Security in LLMs](https://medium.com/@TechforHumans/effective-prompt-engineering-mastering-xml-tags-for-clarity-precision-and-security-in-llms-992cae203fdc)
  - XML tag patterns
  - Security applications
  - Implementation examples

- [Delimiters - What They Are And Why You Should Use Them](https://bennyprompt.com/posts/delimiters-in-prompt-engineering/)
  - Delimiter patterns
  - Effectiveness analysis
  - Practical usage

- [How to Defend Against Prompt Injection: From Delimiters to AI-Based Detection](https://www.gocodeo.com/post/how-to-defend-against-prompt-injection-from-delimiters-to-ai-based-detection/)
  - Comprehensive defense overview
  - Multiple layer approaches
  - Detection techniques

- [Mitigate Prompt Injection Attacks (Android Developers)](https://developer.android.com/privacy-and-security/risks/ai-risks/prompt-injection)
  - Google's official guidance
  - Mobile context
  - Practical recommendations

---

## Detection & Prevention Tools

### Rebuff ⭐ **PRODUCTION DETECTION FRAMEWORK**
- [GitHub: protectai/rebuff](https://github.com/protectai/rebuff)
  - LLM Prompt Injection Detector
  - Self-hardening capability
  - Canary token support

- [Rebuff: Detecting Prompt Injection Attacks (LangChain Blog)](https://blog.langchain.com/rebuff/)
  - Architecture overview
  - Integration guide
  - Use cases

- [Self-Hardening Prompt Injection Detector (Medium)](https://medium.com/@kamaljp/self-hardening-prompt-injection-detector-rebuff-anti-prompt-injection-service-using-llms-6ab766c1c444)
  - Detailed explanation
  - How self-hardening works
  - Implementation notes

### Vigil-LLM ⭐ **OPEN SOURCE DETECTOR**
- [GitHub: deadbits/vigil-llm](https://github.com/deadbits/vigil-llm)
  - Jailbreak & injection detection
  - Canary token support
  - Python implementation

### Canary Token Approach
- [GitHub: Cutwell/canary](https://github.com/Cutwell/canary)
  - LLM-specific canary token implementation
  - Detection methodology
  - Research tool

### LLM Security Tools Overview
- [10 LLM Security Tools to Know in 2025](https://www.pynt.io/learning-hub/llm-security/10-llm-security-tools-to-know)
  - Comprehensive tool review
  - Comparative analysis
  - Selection criteria

- [Prompt Injection Protection Tools](https://llm-tracker.info/research/Prompt-Injection-Protection)
  - Tool database
  - Effectiveness tracking
  - Latest tools

---

## MCP (Model Context Protocol) Security

### Official MCP Documentation
- [Model Context Protocol - Official Spec](https://modelcontextprotocol.io/)
  - Protocol definition
  - Implementation guidelines

- [MCP Security Best Practices](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices)
  - Official security guidance
  - Implementation patterns
  - Threat model

### Critical Security Research
- [Simon Willison: Model Context Protocol has prompt injection security problems](https://simonwillison.net/2025/Apr/9/mcp-prompt-injection/) ⭐ **FOUNDATIONAL**
  - Identifies MCP security issues
  - Attack scenarios
  - Recommendations

- [Simon Willison: New prompt injection papers - Agents Rule of Two and The Attacker Moves Second](https://simonwillison.net/2025/Nov/2/new-prompt-injection-papers/)
  - Recent research summary
  - Architectural patterns
  - Meta's Rule of Two framework

### MCP Implementation Guides
- [Model Context Protocol (MCP): Understanding Security Risks and Controls (RedHat)](https://www.redhat.com/en/blog/model-context-protocol-mcp-understanding-security-risks-and-controls)
  - Enterprise perspective
  - Risk assessment
  - Control recommendations

- [MCP Security Vulnerabilities: How to Prevent Prompt Injection and Tool Poisoning Attacks (PracticalDevSecOps)](https://www.practical-devsecops.com/mcp-security-vulnerabilities/)
  - Tool poisoning details
  - Attack scenarios
  - Prevention strategies

- [Protecting Against Indirect Injection Attacks in MCP (Microsoft)](https://developer.microsoft.com/blog/protecting-against-indirect-injection-attacks-mcp)
  - Microsoft's official guidance
  - Architecture recommendations
  - Defense patterns

### MCP Community
- [June 2025 MCP Content Round-Up (Pomerium)](https://www.pomerium.com/pomerium/blog/june-2025-mcp-content-round-up)
  - Latest MCP developments
  - Security incidents
  - Tool updates

---

## Real-World Attack Examples & Case Studies

### 2025-2026 Incident Timeline
- **April 2025:** Simon Willison identifies MCP security problems
- **June 2025:** Palo Alto Unit 42 releases exploitation guide
- **August 2025:** AuthZed publishes timeline of MCP breaches
- **CVE-2025-6514:** RCE via untrusted MCP server connection
- **February 2026:** Cline/OpenClaw attack → 4,000 machines compromised
- **CVE-2026-24307:** Reprompt single-click exfiltration (Microsoft Copilot Personal)

---

## Educational & General Resources

### CrowdStrike
- [Prompt Injection: Definition and Attack Taxonomy](https://www.crowdstrike.com/en-us/cybersecurity-101/cyberattacks/prompt-injection/)
  - Clear definitions
  - Attack classification
  - Defense overview

### EC-Council
- [What Is Prompt Injection in AI? Examples & Prevention](https://www.eccouncil.org/cybersecurity-exchange/ethical-hacking/what-is-prompt-injection-in-ai-real-world-examples-and-prevention-tips/)
  - Ethical hacking perspective
  - Practical examples
  - Prevention tips

### CyberDesserts
- [Prompt Injection Attacks: Examples and Defences](https://blog.cyberdesserts.com/prompt-injection-attacks/)
  - Case study format
  - Attack + defense pairs
  - Implementation examples

### Medium Articles
- [Understanding LLM01:2025 Prompt Injection (by @ro0taddict)](https://rodelllemit.medium.com/understanding-llm01-2025-prompt-injection-llm-apps-8f04e5d4f825)
  - LLM01 deep-dive
  - Threat categorization
  - Mitigation strategies

- [Prompt Injection Attacks in Large Language Models: Vulnerabilities, Exploitation Techniques, and Defense Strategies](https://medium.com/@jannadikhemais/prompt-injection-attacks-in-large-language-models-vulnerabilities-exploitation-techniques-and-e00fe683f6d7)
  - Comprehensive technical overview
  - Attack techniques catalog
  - Defense evaluation

### Securiti
- [LLM01 OWASP Prompt Injection: Understanding Security Risk in LLM Applications](https://securiti.ai/llm01-owasp-prompt-injection/)
  - OWASP LLM01 explained
  - Risk assessment
  - Enterprise context

### Indusface
- [LLM01:2025 Prompt Injection: Risks & Mitigation](https://www.indusface.com/learning/owasp-llm-prompt-injection/)
  - 2025 update summary
  - Mitigation techniques
  - Best practices

### Confident AI
- [OWASP Top 10 2025 for LLM Applications: What's New?](https://www.confident-ai.com/blog/owasp-top-10-2025-for-llm-applications-risks-and-mitigation-techniques)
  - 2025 updates
  - New risks
  - Mitigation guide

### StackHawk
- [Understanding and Protecting Against OWASP LLM01: Prompt Injection](https://www.stackhawk.com/blog/owasp-llm01-prompt-injection/)
  - Application security perspective
  - Detection methods
  - Prevention techniques

### GuidePoint Security
- [Prompt Injection: The AI Vulnerability We Still Can't Fix](https://www.guidepointsecurity.com/blog/prompt-injection-the-ai-vulnerability-we-still-cant-fix/)
  - Reality check perspective
  - Why defenses fail
  - Honest assessment

### GuidePoinT Security & 4Geeks
- [Architecting Robust LLM Firewalls: Strategies for Prompt Shielding](https://blog.4geeks.io/architecting-robust-llm-firewalls-strategies-for-prompt-shielding-in-enterprise-applications/)
  - Firewall approach
  - Architecture patterns
  - Enterprise implementation

---

## GitHub & Open Source

### Educational Repositories
- [GitHub: skew202/agentic-ide-security](https://github.com/skew202/agentic-ide-security)
  - CVEs in AI coding assistants
  - Supply chain attacks
  - Trust boundary documentation
  - Educational reference

---

## News & Security Reporting

### Tech News
- [Critical Vulnerabilities Found in GitHub Copilot, Gemini CLI, Claude, and Other AI Tools Affect Millions (GBHackers)](https://gbhackers.com/ai-developer-tools/)
  - Incident reporting
  - Vulnerability summary
  - Impact assessment

- [AI Browsers Wide Open to Attack via Prompt Injection (The Register)](https://www.theregister.com/2025/10/28/ai-browsers-prompt-injection/)
  - Mainstream coverage
  - Vulnerability impact
  - Industry context

---

## Academic & Expert Perspectives

### OpenAI
- [Continuously Hardening ChatGPT Atlas Against Prompt Injection Attacks](https://openai.org/index/hardening-atlas-against-prompt-injection/)
  - OpenAI's defense approach
  - Implementation details
  - Ongoing hardening

### Meta AI
- [Agents Rule of Two: A Practical Approach to AI Agent Security](https://ai.meta.com/blog/practical-ai-agent-security/)
  - Meta's security framework
  - Rule of Two principle
  - Practical guidance

---

## Research Methodology & Meta-Analyses

### Comprehensive Reviews
- [Prompt Injection 101 Guide (PracticalDevSecOps PDF)](https://www.practical-devsecops.com/wp-content/uploads/2025/12/Prompt-Injection-101-guide.pdf)
  - Educational guide
  - Complete overview
  - Beginner-friendly

### Attack Taxonomy
- [Prompt Injection: Definition and Attack Taxonomy (Lasso Security)](https://www.lasso.security/blog/prompt-injection-taxonomy-techniques)
  - Structured taxonomy
  - Attack classification
  - Technical precision

---

## Version Control & Transparency

All sources were accessed and verified **March 1-5, 2026**. Links to arXiv papers, GitHub, and official documentation were confirmed active.

Sources prioritized in order of:
1. Official standards (OWASP, NCSC, Microsoft official)
2. Academic / peer-reviewed (arXiv, MDPI)
3. Industry research (Snyk, Palo Alto, eSentire, Vectra)
4. Security tools & implementations (Rebuff, Bleach, GitHub)
5. Educational content (blogs, guides, tutorials)

---

**Last Updated:** March 5, 2026
**Total Sources:** 70+
**Categories:** 10
