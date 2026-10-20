/**
 * Collection revision content: the member list and the non-secret config of
 * one immutable revision, validated together, and its digest. The digest is
 * the canonical JSON of `{config, members}` with members sorted by package,
 * so equal content always gets an equal digest whatever the input order.
 */
import { canonicalJsonBytes } from "./canonical-json";
import { validateCollectionMember } from "./collections";
import type { CollectionConfig, CollectionMember } from "./collections";
import { sha256Digest } from "./release-signature";
import { findSyncLeaks } from "./sync-leaks";
import { isPlainObject, issue, validationFail, validationOk } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";

export const COLLECTION_LIMITS = { maxMembers: 256, maxConfigKeys: 64, maxConfigValueLength: 1024 } as const;
const CONFIG_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

export interface CollectionContent {
  members: CollectionMember[];
  config: CollectionConfig;
}

/** Members (unique by package) and config (flat scalars, no secrets, no absolute paths). */
export function validateCollectionContent(input: { members?: unknown; config?: unknown }): ValidationResult {
  const issues: ValidationIssue[] = [];
  const members = input.members ?? [];
  if (!Array.isArray(members)) {
    issues.push(issue("members", "type", "members must be an array"));
  } else {
    if (members.length > COLLECTION_LIMITS.maxMembers) issues.push(issue("members", "limit", `at most ${COLLECTION_LIMITS.maxMembers} members`));
    const seen = new Set<string>();
    members.forEach((member, i) => {
      for (const found of validateCollectionMember(member).issues) issues.push(issue(`members[${i}]${found.path === "" ? "" : `.${found.path}`}`, found.code, found.message));
      if (isPlainObject(member)) {
        for (const key of Object.keys(member)) {
          if (!["packageName", "version", "digest", "optional"].includes(key)) issues.push(issue(`members[${i}].${key}`, "unknown_field", "is not a member field"));
        }
        if (member.digest !== undefined && member.version === undefined) issues.push(issue(`members[${i}].digest`, "required", "a digest pin needs its version"));
        const name = String(member.packageName);
        if (seen.has(name)) issues.push(issue(`members[${i}].packageName`, "duplicate", `${name} is listed twice`));
        seen.add(name);
      }
    });
  }
  const config = input.config ?? {};
  if (!isPlainObject(config)) {
    issues.push(issue("config", "type", "config must be an object"));
  } else {
    const entries = Object.entries(config);
    if (entries.length > COLLECTION_LIMITS.maxConfigKeys) issues.push(issue("config", "limit", `at most ${COLLECTION_LIMITS.maxConfigKeys} keys`));
    for (const [key, value] of entries) {
      if (!CONFIG_KEY.test(key)) issues.push(issue(`config.${key}`, "pattern", "config keys are short identifiers"));
      const scalar = typeof value === "boolean" || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) || typeof value === "string";
      if (!scalar) issues.push(issue(`config.${key}`, "type", "config values are strings, booleans or non-negative integers"));
      if (typeof value === "string" && value.length > COLLECTION_LIMITS.maxConfigValueLength) issues.push(issue(`config.${key}`, "limit", "config value too long"));
    }
  }
  for (const leak of findSyncLeaks({ members, config })) issues.push(issue(leak.path, `sync.${leak.rule}`, "collections must not carry secrets or absolute local paths"));
  return issues.length === 0 ? validationOk() : validationFail(issues);
}

/** Members sorted by package name; the stored and digested order. */
export function sortCollectionMembers(members: readonly CollectionMember[]): CollectionMember[] {
  return [...members].sort((a, b) => (a.packageName < b.packageName ? -1 : a.packageName > b.packageName ? 1 : 0));
}

/** `sha256:<hex>` of the canonical `{config, members}` of a revision. */
export function collectionRevisionDigest(content: CollectionContent): Promise<string> {
  return sha256Digest(canonicalJsonBytes({ config: content.config, members: sortCollectionMembers(content.members) }));
}
