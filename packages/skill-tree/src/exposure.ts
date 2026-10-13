/**
 * Exposure derivation from SKILL.md frontmatter (AgentKit skill lifecycle
 * contract 10.2). Keys are read as YAML 1.2 nodes, never decoded into typed
 * booleans: only the plain scalars true/True/TRUE and false/False/FALSE count.
 */
import { isAlias, isMap, isScalar, parseDocument } from "yaml";
import type { Node, Pair } from "yaml";

export type Exposure = "INTERNAL" | "EXPLICIT" | "AUTO";

export interface ExposureResult {
  exposure: Exposure;
  /** True when the frontmatter was unusable and AUTO is a fallback. */
  warning: boolean;
}

const EXPOSURE_KEYS = new Set(["user-invocable", "disable-model-invocation"]);
const AUTO: ExposureResult = { exposure: "AUTO", warning: false };
const AUTO_WARN: ExposureResult = { exposure: "AUTO", warning: true };

function keyName(key: unknown): string {
  if (!isScalar(key)) return "";
  return typeof key.source === "string" ? key.source : String(key.value);
}

/** An explicit tag, an anchor or an alias makes a key or value unusable. */
function isUnsafeNode(node: unknown): boolean {
  if (isAlias(node)) return true;
  if (node === null || typeof node !== "object") return false;
  const { anchor, tag } = node as Node;
  return (anchor !== undefined && anchor !== "") || (tag !== undefined && tag !== "");
}

/** The boolean of a plain scalar spelled exactly as YAML 1.2 core booleans, else undefined. */
function plainBool(node: unknown): boolean | undefined {
  if (!isScalar(node) || node.type !== "PLAIN" || typeof node.source !== "string") return undefined;
  if (["true", "True", "TRUE"].includes(node.source)) return true;
  if (["false", "False", "FALSE"].includes(node.source)) return false;
  return undefined;
}

/** Exposure of a frontmatter block (the text between the delimiter lines). */
export function frontmatterExposure(frontmatter: string): ExposureResult {
  const doc = parseDocument(frontmatter, { version: "1.2", uniqueKeys: false });
  if (doc.errors.length > 0) return AUTO_WARN;
  // An empty or comment-only block holds no document node.
  if (doc.contents === null) return AUTO;
  if (!isMap(doc.contents)) return AUTO_WARN;
  const values = new Map<string, unknown>();
  for (const pair of doc.contents.items as Pair[]) {
    const name = keyName(pair.key);
    if (!EXPOSURE_KEYS.has(name)) continue;
    if (values.has(name) || isUnsafeNode(pair.key) || isUnsafeNode(pair.value)) return AUTO_WARN;
    values.set(name, pair.value);
  }
  if (plainBool(values.get("user-invocable")) === false) return { exposure: "INTERNAL", warning: false };
  if (plainBool(values.get("disable-model-invocation")) === true) return { exposure: "EXPLICIT", warning: false };
  return AUTO;
}

const isFence = (line: string) => line.replace(/[ \t]+$/, "") === "---";

/**
 * Exposure of a whole SKILL.md: frontmatter is the block between a first
 * line "---" and the next "---" line, after removing a UTF-8 BOM and the CR
 * of each CRLF. No first fence means no frontmatter; an unclosed block warns.
 */
export function skillFileExposure(file: string): ExposureResult {
  const text = (file.startsWith("﻿") ? file.slice(1) : file).replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  if (!isFence(lines[0] ?? "")) return AUTO;
  for (let i = 1; i < lines.length; i++) {
    if (isFence(lines[i]!)) return frontmatterExposure(lines.slice(1, i).join("\n"));
  }
  return AUTO_WARN;
}
