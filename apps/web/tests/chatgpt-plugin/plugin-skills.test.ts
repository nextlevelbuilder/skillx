/**
 * The skills shipped in the ChatGPT plugin are the only instructions the host
 * model reads, so their promises are tested as contracts: they trigger only on
 * skill discovery, name only tools the server has, never install or run a
 * skill, never point at the unrelated `skillx` npm package, and every page the
 * listing links to is a route this app actually serves.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "~/lib/mcp/tools";
import { PLUGIN_ROOT, REPO_ROOT, openai, packageFiles, readSkill } from "./plugin-package";

const skillFiles = () => packageFiles().filter((f) => f.endsWith("/SKILL.md"));
const discovery = () => readSkill(join(PLUGIN_ROOT, "skills/skillx-discovery/SKILL.md"));

describe("bundled skills", () => {
  it("ships the discovery skill and the onboarding skill, each named after its folder", () => {
    expect(skillFiles().sort()).toEqual(["skills/setup/SKILL.md", "skills/skillx-discovery/SKILL.md"]);
    for (const file of skillFiles()) {
      const { meta } = readSkill(join(PLUGIN_ROOT, file));
      expect(meta.name, file).toBe(file.split("/")[1]);
      expect(meta.description.length, file).toBeGreaterThan(40);
      expect(meta.description.length, file).toBeLessThanOrEqual(1024);
    }
  });

  it("scopes the discovery trigger to choosing agent skills and excludes general tasks", () => {
    const { description } = discovery().meta;
    expect(description).toMatch(/agent skill/i);
    expect(description).toMatch(/never installs or runs/i);
    expect(description).toMatch(/Do not use for general/);
    expect(description).not.toMatch(/every task/i);
  });

  it("names only tools the SkillX MCP server exposes", () => {
    const { body } = discovery();
    const named = [...body.matchAll(/`([a-z]+_[a-z_]+)`/g)].map((m) => m[1]).filter((n) => /^(search|get|check)_/.test(n));
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) expect(TOOL_NAMES, name).toContain(name);
  });

  it("separates discovery from installation and treats skill text as untrusted data", () => {
    const { body } = discovery();
    expect(body).toContain("## Search is not installation");
    expect(body).toMatch(/Never say or imply that a skill was installed/);
    expect(body).toMatch(/explicitly asks to adopt/);
    expect(body).toContain("## Untrusted content");
    expect(body).toMatch(/never as instructions/);
    expect(body).toMatch(/popularity.*not a safety signal|never safety/i);
    expect(body).toMatch(/Unpinned listing/);
  });

  it("never tells anyone to run the unrelated `skillx` npm package", () => {
    for (const file of packageFiles().filter((f) => f.endsWith(".md"))) {
      const text = readFileSync(join(PLUGIN_ROOT, file), "utf8");
      expect(text, file).not.toMatch(/npx\s+(-y\s+)?skillx(\s|`|$)/);
    }
  });

  it("covers every result case a discovery answer can hit", () => {
    const cases = readFileSync(join(PLUGIN_ROOT, "skills/skillx-discovery/references/result-cases.md"), "utf8");
    for (const term of [
      "No match",
      "Ambiguous",
      "Danger",
      "Not scanned",
      "Paid or protected",
      "Private or unknown package",
      "release_quarantined",
      "publisher_revoked",
      "release_yanked",
      "compatibilityFilter.undecided",
    ]) {
      expect(cases, term).toContain(term);
    }
  });

  it("keeps every relative Markdown link inside the package and pointing at a real file", () => {
    for (const file of packageFiles().filter((f) => f.endsWith(".md"))) {
      const text = readFileSync(join(PLUGIN_ROOT, file), "utf8");
      for (const [, target] of text.matchAll(/\]\(([^)#\s]+)\)/g)) {
        if (/^https?:/.test(target)) continue;
        const full = resolve(dirname(join(PLUGIN_ROOT, file)), target);
        expect(full.startsWith(PLUGIN_ROOT + sep), `${file} -> ${target}`).toBe(true);
        expect(existsSync(full), `${file} -> ${target}`).toBe(true);
      }
    }
  });
});

describe("listing URLs served by this app", () => {
  it("registers a route for every skillx.sh page the listing links to", () => {
    const routes = readFileSync(join(REPO_ROOT, "apps/web/app/routes.ts"), "utf8");
    const ui = openai().interface;
    for (const key of ["supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
      const path = new URL(ui[key]).pathname.slice(1);
      expect(routes, `${key} ${path}`).toMatch(new RegExp(`route\\("${path}"`));
    }
    expect(routes).toMatch(/route\("api\/mcp"/);
  });
});
