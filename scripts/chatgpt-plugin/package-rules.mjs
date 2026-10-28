/**
 * Field-level rules for the ChatGPT plugin package check: lengths, URLs, brand
 * colors, images and keys the public directory refuses. The limits mirror
 * OpenAI's published submission requirements.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const HEX = /^#[0-9A-Fa-f]{6}$/;
export const IMAGE_EXT = /\.(png|jpe?g|webp|svg)$/i;
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export const FORBIDDEN_KEYS = ["apps", "hooks", "test_credentials", "reviewer_instructions", "clientSecret"];

/** WCAG relative luminance of `#RRGGBB`. */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function checkLength(errors, label, value, max, required = true) {
  if (value === undefined || value === "") {
    if (required) errors.push(`${label} is required`);
    return;
  }
  if (typeof value !== "string") errors.push(`${label} must be a string`);
  else if (value.length > max) errors.push(`${label} is ${value.length} characters (max ${max})`);
}

export function checkUrl(errors, label, value) {
  if (typeof value !== "string" || !value) return errors.push(`${label} is required`);
  let url;
  try {
    url = new URL(value);
  } catch {
    return errors.push(`${label} is not a URL`);
  }
  if (url.protocol !== "https:") errors.push(`${label} must use https`);
  if (url.username || url.password) errors.push(`${label} must not embed credentials`);
  if (value.length > 1024) errors.push(`${label} is longer than 1024 characters`);
}

/** Square, at least 48 px, within the size and format limits. */
export function checkImage(errors, dir, label, path) {
  if (typeof path !== "string" || !path.startsWith("./")) return errors.push(`${label} must be a ./-relative path`);
  const file = join(dir, path);
  if (!existsSync(file)) return errors.push(`${label} points to a missing file ${path}`);
  if (!IMAGE_EXT.test(path)) errors.push(`${label} must be PNG, JPEG, WebP or SVG`);
  if (statSync(file).size > MAX_ASSET_BYTES) errors.push(`${label} is larger than 5 MiB`);
  if (/\.svg$/i.test(path)) {
    const box = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(readFileSync(file, "utf8"));
    if (!box) errors.push(`${label} SVG needs a numeric viewBox`);
    else if (box[1] !== box[2] || Number(box[1]) < 48) errors.push(`${label} SVG viewBox must be square and at least 48x48`);
  }
}

export function findForbiddenKeys(value, path, found) {
  if (Array.isArray(value)) value.forEach((item, i) => findForbiddenKeys(item, `${path}[${i}]`, found));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(key)) found.push(`${path}.${key}`);
      findForbiddenKeys(child, `${path}.${key}`, found);
    }
  }
  return found;
}

/** `name` and `description` from a SKILL.md YAML header (single-line values). */
export function readFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split("\n")) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return fields;
}

