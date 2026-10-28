/**
 * Readers for the ChatGPT plugin package under `integrations/chatgpt/plugin`.
 *
 * The package is what gets zipped and uploaded to the OpenAI plugin portal, so
 * these helpers read it from disk exactly as the portal would: the manifest,
 * the MCP declaration, every file under the root, and image headers.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const PLUGIN_ROOT = join(REPO_ROOT, "integrations/chatgpt/plugin");

export type Json = Record<string, any>;

export function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}

export const manifest = (): Json => readJson(join(PLUGIN_ROOT, "plugin.json"));
export const mcpConfig = (): Json => readJson(join(PLUGIN_ROOT, "mcp.json"));
export const openai = (): Json => manifest().extensions["com.openai"];
export const schema = (name: "plugin" | "mcp"): Json =>
  readJson(fileURLToPath(new URL(`./schemas/${name}.schema.json`, import.meta.url)));

/** Every file in the package, as root-relative POSIX paths. */
export function packageFiles(dir = PLUGIN_ROOT): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? packageFiles(full)
      : [relative(PLUGIN_ROOT, full).split(sep).join("/")];
  });
}

/** Resolves a manifest path (`./x`) and reports whether it stays inside the root. */
export function resolvePackagePath(path: string): { full: string; inside: boolean } {
  const full = resolve(PLUGIN_ROOT, path);
  return { full, inside: full.startsWith(PLUGIN_ROOT + sep) };
}

/** Width and height from a PNG IHDR chunk; null when the file is not a PNG. */
export function pngSize(path: string): { width: number; height: number } | null {
  const bytes = readFileSync(path);
  const signature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== signature) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** WCAG 2 contrast ratio between two `#RRGGBB` colors. */
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** SKILL.md frontmatter as flat `key: value` pairs, plus the body. */
export function readSkill(path: string): { meta: Record<string, string>; body: string } {
  const text = readFileSync(path, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${path} has no frontmatter`);
  const meta = Object.fromEntries(
    match[1].split("\n").map((line) => {
      const at = line.indexOf(":");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
  return { meta, body: match[2] };
}
