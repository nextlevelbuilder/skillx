/**
 * Offline check of the ChatGPT plugin package against the limits OpenAI
 * publishes for Agent Plugins submissions (developers.openai.com/plugins).
 *
 * It catches what the portal would reject on upload, before a maintainer spends
 * a review cycle: manifest shape and lengths, URL and color rules, asset sizes,
 * skill frontmatter, review test cases and anything the public directory
 * refuses (hooks, app mappings, credentials). It does not replace the portal's
 * own skill and MCP scans; `pending` lists the owner steps left for the portal.
 *
 * Usage: node scripts/chatgpt-plugin/validate-package.mjs [packageDir]
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HEX, checkImage, checkLength, checkUrl, contrast, findForbiddenKeys, readFrontmatter } from "./package-rules.mjs";

export { contrast } from "./package-rules.mjs";

export const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const TOP_LEVEL = new Set(["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"]);
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function checkSkills(errors, dir) {
  const root = join(dir, "skills");
  const names = existsSync(root) ? readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory()) : [];
  if (names.length === 0) errors.push("skills/ must contain at least one skill");
  for (const name of names) {
    const file = join(root, name, "SKILL.md");
    if (!existsSync(file)) {
      errors.push(`skills/${name} has no SKILL.md`);
      continue;
    }
    const text = readFileSync(file, "utf8");
    const fm = readFrontmatter(text);
    if (!fm) {
      errors.push(`skills/${name}/SKILL.md has no YAML frontmatter`);
      continue;
    }
    if (fm.name !== name) errors.push(`skills/${name}/SKILL.md name must equal its folder name`);
    if (!NAME.test(fm.name ?? "") || fm.name.length > 64) errors.push(`skills/${name}/SKILL.md name is invalid`);
    checkLength(errors, `skills/${name}/SKILL.md description`, fm.description, 1024);
    for (const ref of text.matchAll(/`(references\/[^`\s]+)`/g)) {
      if (!existsSync(join(root, name, ref[1]))) errors.push(`skills/${name}/SKILL.md references missing ${ref[1]}`);
    }
  }
  return names;
}

function checkTestCases(errors, review, knownTools) {
  const cases = review?.test_cases;
  const positive = cases?.positive ?? [];
  const negative = cases?.negative ?? [];
  if (positive.length < 5) errors.push(`review.test_cases.positive needs 5 cases (has ${positive.length})`);
  if (negative.length < 3) errors.push(`review.test_cases.negative needs 3 cases (has ${negative.length})`);
  positive.forEach((c, i) => {
    for (const field of ["description", "prompt", "tools_triggered", "expected_behavior"]) {
      if (typeof c[field] !== "string" || !c[field].trim()) errors.push(`positive[${i}].${field} is required`);
    }
    for (const tool of String(c.tools_triggered ?? "").split(",").map((t) => t.trim()).filter(Boolean)) {
      if (knownTools && !knownTools.includes(tool)) errors.push(`positive[${i}] names unknown tool ${tool}`);
    }
  });
  negative.forEach((c, i) => {
    for (const field of ["description", "prompt"]) {
      if (typeof c[field] !== "string" || !c[field].trim()) errors.push(`negative[${i}].${field} is required`);
    }
  });
}

function checkMcp(errors, dir) {
  const file = join(dir, "mcp.json");
  if (!existsSync(file)) return [];
  const mcp = JSON.parse(readFileSync(file, "utf8"));
  if (mcp.$schema !== MCP_SCHEMA) errors.push(`mcp.json $schema must be ${MCP_SCHEMA}`);
  const servers = Object.entries(mcp.mcpServers ?? {});
  if (servers.length !== 1) errors.push("mcp.json must declare exactly one server (one MCP server per plugin)");
  for (const [name, server] of servers) {
    if (server.type !== "streamable-http") errors.push(`mcp.json ${name} must be streamable-http`);
    checkUrl(errors, `mcp.json ${name}.url`, server.url);
    if (server.headers && Object.keys(server.headers).length > 0) errors.push(`mcp.json ${name} must not set headers`);
    const auth = server.extensions?.["com.openai"]?.auth;
    if (!["none", "oauth", "mixed"].includes(auth?.type)) errors.push(`mcp.json ${name} auth.type must be none, oauth or mixed`);
  }
  return servers.map(([, server]) => server.url);
}

/**
 * Validates a package directory. `knownTools` (the server's tool names) lets the
 * caller prove every test case names a tool that really exists.
 */
export function validatePackage(dir, { knownTools } = {}) {
  const errors = [];
  const pending = [];
  const manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8"));

  if (manifest.$schema !== PLUGIN_SCHEMA) errors.push(`plugin.json $schema must be ${PLUGIN_SCHEMA}`);
  for (const key of Object.keys(manifest)) if (!TOP_LEVEL.has(key)) errors.push(`plugin.json has unknown key ${key}`);
  if (!NAME.test(manifest.name ?? "") || manifest.name.length > 64) errors.push("name must be lowercase letters, digits and single hyphens (max 64)");
  if (!SEMVER.test(manifest.version ?? "")) errors.push("version must be an explicit semantic version");
  checkLength(errors, "description", manifest.description, 4000);
  checkLength(errors, "author.name", manifest.author?.name, 200);

  const openai = manifest.extensions?.["com.openai"] ?? {};
  const ui = openai.interface ?? {};
  checkLength(errors, "displayName", ui.displayName, 30);
  checkLength(errors, "shortDescription", ui.shortDescription, 30);
  checkLength(errors, "longDescription", ui.longDescription, 4000);
  checkLength(errors, "developerName", ui.developerName, 80);
  checkLength(errors, "category", ui.category, 80);
  const capabilities = ui.capabilities ?? [];
  if (!Array.isArray(capabilities) || capabilities.length > 20 || capabilities.some((c) => typeof c !== "string" || c.length > 120)) {
    errors.push("capabilities must be at most 20 strings of 120 characters");
  }
  const prompts = ui.defaultPrompt ?? [];
  if (prompts.length > 3 || new Set(prompts).size !== prompts.length) errors.push("defaultPrompt allows up to three unique prompts");
  prompts.forEach((p, i) => {
    if (p.length > 128) errors.push(`defaultPrompt[${i}] is longer than 128 characters`);
    if (/(^|\s)@\w/.test(p)) errors.push(`defaultPrompt[${i}] must not @mention an app`);
  });
  for (const [key, against] of [["brandColor", "#FFFFFF"], ["brandColorDark", "#212121"]]) {
    if (ui[key] === undefined) continue;
    if (!HEX.test(ui[key])) errors.push(`${key} must be #RRGGBB`);
    else if (contrast(ui[key], against) < 2) errors.push(`${key} needs 2:1 contrast against ${against}`);
  }
  for (const key of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) checkUrl(errors, key, ui[key]);
  checkImage(errors, dir, "logo", ui.logo);
  for (const key of ["logoDark", "composerIcon", "composerIconDark"]) if (ui[key] !== undefined) checkImage(errors, dir, key, ui[key]);
  for (const [i, shot] of (ui.screenshots ?? []).entries()) {
    if (!existsSync(join(dir, shot))) errors.push(`screenshots[${i}] points to a missing file`);
  }
  if (openai.onboardingSkill !== undefined && !existsSync(join(dir, openai.onboardingSkill, "SKILL.md"))) {
    errors.push("onboardingSkill must point to an included skill");
  }

  for (const path of findForbiddenKeys(manifest, "plugin.json", [])) errors.push(`${path} cannot be submitted publicly`);
  for (const banned of ["hooks", ".app.json", ".codex-plugin", ".env"]) {
    if (existsSync(join(dir, banned))) errors.push(`${banned} cannot be part of a public submission`);
  }

  checkSkills(errors, dir);
  const servers = checkMcp(errors, dir);
  if (servers.length > 0) {
    checkTestCases(errors, openai.review, knownTools);
    if (!openai.review?.demo_recording_url) pending.push("review.demo_recording_url: record the demo after connecting in developer mode, then add the URL");
    pending.push(`Domain verification: set OPENAI_APPS_CHALLENGE so ${new URL(servers[0]).origin}/.well-known/openai-apps-challenge serves the portal token`);
  }
  return { errors, pending, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? "integrations/chatgpt-plugin");
  const { errors, pending } = validatePackage(dir);
  for (const line of pending) console.log(`pending: ${line}`);
  if (errors.length > 0) {
    for (const line of errors) console.error(`error: ${line}`);
    process.exit(1);
  }
  console.log(`ok: ${dir} passes the offline submission checks`);
}
