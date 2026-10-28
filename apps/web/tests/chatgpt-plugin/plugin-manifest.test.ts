/**
 * The ChatGPT plugin package must pass the portal's metadata checks before it
 * can be submitted, so this suite enforces the published rules locally:
 * the Agent Plugins JSON schemas (vendored under `./schemas`) and the field
 * limits from the OpenAI submission guide
 * (https://developers.openai.com/plugins/deploy/submission).
 *
 * One documented deviation: OpenAI places MCP auth under each server's
 * `extensions["com.openai"]`, which the strict Agent Plugins MCP schema does
 * not list, so that key is removed before schema validation.
 */

import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { TOOL_NAMES } from "~/lib/mcp/tools";
import { contrast, manifest, mcpConfig, openai, packageFiles, pngSize, resolvePackagePath, schema } from "./plugin-package";

const HTTPS_URL = /^https:\/\/[^\s@#]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

function validate(name: "plugin" | "mcp", document: unknown) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const check = ajv.compile(schema(name));
  return check(document) ? [] : check.errors;
}

describe("plugin.json", () => {
  it("validates against the Agent Plugins manifest schema", () => {
    expect(validate("plugin", manifest())).toEqual([]);
  });

  it("meets the OpenAI identity limits", () => {
    const m = manifest();
    expect(m.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(m.name.length).toBeLessThanOrEqual(64);
    expect(m.version).toMatch(SEMVER);
    expect(m.description.length).toBeLessThanOrEqual(4000);
    expect(m.homepage).toMatch(HTTPS_URL);
  });

  it("fills every listing field within its limit", () => {
    const ui = openai().interface;
    expect(ui.displayName.length).toBeLessThanOrEqual(30);
    expect(ui.shortDescription.length).toBeLessThanOrEqual(30);
    expect(ui.longDescription.length).toBeLessThanOrEqual(4000);
    expect(ui.developerName.length).toBeLessThanOrEqual(80);
    expect(ui.category).toBeTruthy();
    expect(ui.capabilities.length).toBeLessThanOrEqual(20);
    for (const capability of ui.capabilities) expect(capability.length).toBeLessThanOrEqual(120);
  });

  it("links HTTPS website, support, privacy and terms pages, required for MCP review", () => {
    const ui = openai().interface;
    for (const key of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
      expect(ui[key], key).toMatch(HTTPS_URL);
      expect(ui[key].length, key).toBeLessThanOrEqual(1024);
    }
  });

  it("offers at most three unique, short default prompts without app mentions", () => {
    const prompts: string[] = openai().interface.defaultPrompt;
    expect(prompts.length).toBeLessThanOrEqual(3);
    expect(new Set(prompts).size).toBe(prompts.length);
    for (const prompt of prompts) {
      expect(prompt.length).toBeLessThanOrEqual(128);
      expect(prompt).not.toContain("@");
    }
  });

  it("uses brand colors with the required 2:1 contrast in both themes", () => {
    const ui = openai().interface;
    expect(contrast(ui.brandColor, "#FFFFFF")).toBeGreaterThanOrEqual(2);
    expect(contrast(ui.brandColorDark, "#212121")).toBeGreaterThanOrEqual(2);
  });

  it("ships square PNG icons between 48 and 4096 px and under 5 MiB", () => {
    const ui = openai().interface;
    for (const key of ["logo", "composerIcon"]) {
      expect(ui[key], key).toMatch(/^\.\//);
      const { full, inside } = resolvePackagePath(ui[key]);
      expect(inside, key).toBe(true);
      const size = pngSize(full);
      expect(size, key).not.toBeNull();
      expect(size!.width).toBe(size!.height);
      expect(size!.width).toBeGreaterThanOrEqual(48);
      expect(size!.width).toBeLessThanOrEqual(4096);
      expect(statSync(full).size).toBeLessThanOrEqual(5 * 1024 * 1024);
    }
  });

  it("points the onboarding skill at a SKILL.md inside the package", () => {
    const { full, inside } = resolvePackagePath(openai().onboardingSkill);
    expect(inside).toBe(true);
    expect(existsSync(full)).toBe(true);
  });

  it("has exactly five positive and three negative review cases naming real tools", () => {
    const { positive, negative } = openai().review.test_cases;
    expect(positive).toHaveLength(5);
    expect(negative).toHaveLength(3);
    for (const testCase of positive) {
      expect(testCase.description && testCase.prompt && testCase.expected_behavior).toBeTruthy();
      for (const tool of String(testCase.tools_triggered).split(",").map((t) => t.trim())) {
        expect(TOOL_NAMES, `${testCase.description}: ${tool}`).toContain(tool);
      }
    }
    for (const testCase of negative) expect(testCase.description && testCase.prompt).toBeTruthy();
  });
});

describe("mcp.json", () => {
  it("validates against the Agent Plugins MCP schema once the OpenAI auth extension is set aside", () => {
    const config = structuredClone(mcpConfig());
    for (const server of Object.values<Record<string, unknown>>(config.mcpServers)) delete server.extensions;
    expect(validate("mcp", config)).toEqual([]);
  });

  it("declares exactly one remote HTTPS server, anonymous, at the production endpoint", () => {
    const servers = Object.values<Record<string, any>>(mcpConfig().mcpServers);
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({ type: "streamable-http", url: "https://skillx.sh/api/mcp" });
    expect(servers[0].extensions["com.openai"].auth).toEqual({ type: "none" });
  });
});

describe("package contents", () => {
  it("contains no hooks, app mappings, scripts or credentials the portal would reject", () => {
    const files = packageFiles();
    expect(files.filter((f) => f.startsWith("hooks/") || f.endsWith(".app.json"))).toEqual([]);
    expect(files.filter((f) => !/\.(json|md|png)$/.test(f))).toEqual([]);
    const openaiKeys = Object.keys(openai());
    expect(openaiKeys).not.toContain("apps");
    expect(openaiKeys).not.toContain("hooks");
    const text = JSON.stringify([manifest(), mcpConfig()]);
    for (const banned of ["clientSecret", "test_credentials", "reviewer_instructions"]) {
      expect(text).not.toContain(banned);
    }
  });
});
