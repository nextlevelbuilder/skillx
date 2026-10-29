import { isInstallAlias } from '@skillx/contracts';
import { parseDocument } from 'yaml';

/**
 * SKILL.md front matter, read as data only. The block is the text between a
 * first line `---` and the next `---` line (a UTF-8 BOM and CRLF are
 * tolerated), parsed by `yaml` with the YAML 1.2 core schema. No engine is
 * ever picked from the fence: `---js`, `---javascript` or `---coffee` is not
 * a fence, so such a file has no front matter and is skipped, never run. A
 * tag, a duplicate key or any parse problem rejects the block.
 *
 * The skill's `name` becomes its installed directory, so it must already be a
 * valid install alias; it is never rewritten, so two names never merge. Names
 * starting with `ak-` or `ak:` belong to AgentKit and are refused.
 */

export type Frontmatter = { ok: true; name: string; description: string } | { ok: false; reason: string };

const isFence = (line: string | undefined) => line !== undefined && line.replace(/[ \t]+$/, '') === '---';
const fail = (reason: string): Frontmatter => ({ ok: false, reason });

/** True for names AgentKit reserves for its kit skills, in any case. */
export const isReservedSkillName = (name: string) => /^ak[-:]/i.test(name);

export function readFrontmatter(bytes: Uint8Array): Frontmatter {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('SKILL.md is not valid UTF-8');
  }
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
  if (!isFence(lines[0])) return fail('SKILL.md has no front matter (the first line must be ---)');
  const end = lines.findIndex((line, i) => i > 0 && isFence(line));
  if (end < 0) return fail('SKILL.md front matter is not closed by a --- line');
  const doc = parseDocument(lines.slice(1, end).join('\n'), { version: '1.2', schema: 'core', uniqueKeys: true });
  if (doc.errors.length > 0 || doc.warnings.length > 0) return fail('SKILL.md front matter is not plain YAML');
  if (hasTags(doc.contents)) return fail('SKILL.md front matter uses YAML tags');
  const data: unknown = doc.toJS({ maxAliasCount: 10 });
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return fail('SKILL.md front matter is not a mapping');
  const { name, description } = data as Record<string, unknown>;
  if (typeof name !== 'string' || name.trim() === '') return fail('SKILL.md front matter needs a non-empty name');
  if (typeof description !== 'string' || description.trim() === '') return fail('SKILL.md front matter needs a non-empty description');
  if (isReservedSkillName(name)) return fail(`'${name}' is reserved: ak- and ak: names belong to AgentKit`);
  if (!isInstallAlias(name)) return fail(`'${name}' is not a valid skill directory name (lowercase letters, digits, '.', '_' and '-')`);
  return { ok: true, name, description: description.trim() };
}

/** True when any node of the document carries an explicit tag. */
function hasTags(node: unknown): boolean {
  if (node === null || typeof node !== 'object') return false;
  const n = node as { tag?: string; items?: unknown[]; key?: unknown; value?: unknown };
  if (typeof n.tag === 'string' && n.tag !== '') return true;
  if (Array.isArray(n.items)) return n.items.some(hasTags);
  return hasTags(n.key) || hasTags(n.value);
}
