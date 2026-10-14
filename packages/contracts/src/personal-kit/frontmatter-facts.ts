/**
 * Semantic facts of a skill tree that a rebase must not change silently:
 * SKILL.md frontmatter (`allowed-tools`, `hooks`, `license`,
 * `dependencies`), the derived exposure, executable files, declared
 * scripts and the relative links SKILL.md makes to other files. Frontmatter
 * is read as YAML 1.2; an unusable block yields empty facts (the exposure
 * rule already reports it), never a guess.
 */
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Pair } from "yaml";
import { MODE_EXECUTABLE, skillFileExposure } from "@skillx/skill-tree/rules";
import type { Exposure } from "@skillx/skill-tree/rules";
import { textOf } from "./bytes";
import type { KitTree } from "./kit-tree";

export interface TreeFacts {
  exposure: Exposure;
  /** Sorted, de-duplicated tool names; null when the key is absent (no restriction). */
  allowedTools: string[] | null;
  /** Canonical text of the `hooks` value, or null when absent. */
  hooks: string | null;
  license: string | null;
  /** Sorted dependency names. */
  dependencies: string[];
  /** Sorted paths with mode 100755. */
  executables: string[];
  /** Sorted declared script paths. */
  scripts: string[];
  /** Sorted tree paths SKILL.md links to, resolved relative to the root. */
  links: string[];
}

const SKILL_FILE = "SKILL.md";

function frontmatterOf(text: string): string | null {
  const lines = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trimEnd() !== "---") return null;
  for (let i = 1; i < lines.length; i++) if (lines[i]!.trimEnd() === "---") return lines.slice(1, i).join("\n");
  return null;
}

const sortedUnique = (values: string[]) => [...new Set(values)].sort();

function stringList(value: unknown): string[] {
  if (isScalar(value) && typeof value.value === "string") return value.value.split(/[\s,]+/).filter((s) => s !== "");
  if (isSeq(value)) return value.items.flatMap((item) => (isScalar(item) && typeof item.value === "string" ? [item.value.trim()] : []));
  return [];
}

function readFrontmatter(frontmatter: string | null): Pick<TreeFacts, "allowedTools" | "hooks" | "license" | "dependencies"> {
  const empty = { allowedTools: null, hooks: null, license: null, dependencies: [] };
  if (frontmatter === null) return empty;
  const doc = parseDocument(frontmatter, { version: "1.2", uniqueKeys: false });
  if (doc.errors.length > 0 || !isMap(doc.contents)) return empty;
  const values = new Map<string, unknown>();
  for (const pair of doc.contents.items as Pair[]) if (isScalar(pair.key)) values.set(String(pair.key.value), pair.value);
  const license = values.get("license");
  const hooks = values.get("hooks");
  return {
    allowedTools: values.has("allowed-tools") ? sortedUnique(stringList(values.get("allowed-tools"))) : null,
    hooks: hooks === undefined || hooks === null ? null : JSON.stringify(doc.toJS().hooks ?? null),
    license: isScalar(license) && license.value !== null ? String(license.value) : null,
    dependencies: sortedUnique(stringList(values.get("dependencies"))),
  };
}

const LINK = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/** Relative links of SKILL.md normalized to tree paths; URLs, anchors and absolute paths are ignored. */
export function relativeLinks(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(LINK)) {
    const target = match[1]!.split("#")[0]!.split("?")[0]!;
    if (target === "" || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) continue;
    const parts: string[] = [];
    let escapes = false;
    for (const seg of target.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") escapes = parts.pop() === undefined || escapes;
      else parts.push(seg);
    }
    if (!escapes && parts.length > 0) out.push(parts.join("/"));
  }
  return sortedUnique(out);
}

/** Facts of a tree. Reads only SKILL.md. */
export async function treeFacts(tree: KitTree): Promise<TreeFacts> {
  const skill = tree.files.find((f) => f.path === SKILL_FILE);
  const text = skill === undefined ? null : textOf(await tree.read(SKILL_FILE));
  return {
    exposure: text === null ? "AUTO" : skillFileExposure(text).exposure,
    ...readFrontmatter(text === null ? null : frontmatterOf(text)),
    executables: tree.files.filter((f) => f.mode === MODE_EXECUTABLE).map((f) => f.path),
    scripts: sortedUnique([...(tree.declaredScripts ?? [])]),
    links: text === null ? [] : relativeLinks(text),
  };
}
