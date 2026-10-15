import { describe, expect, it } from "vitest";
import vectors from "../fixtures/kit-proposal-policy-vectors-v1.json";
import { KIT_PROPOSAL_POLICY, KIT_PROPOSAL_POLICY_SCHEMA, findForbiddenProposalKey, isForbiddenProposalKey, normalizeProposalKey } from "./proposal-policy";

/**
 * The shared `skillx.kit-proposal-policy/v1` rules and their vectors, the
 * contract AgentKit tests against. The content vectors (paths, secrets) run
 * against the web detectors in `apps/web/tests/personal-kits`.
 */
const sortedUnique = (list: string[]) => [...new Set(list)].sort();

describe("kit proposal policy file", () => {
  it("names its schema and the envelope it governs", () => {
    expect(KIT_PROPOSAL_POLICY.schema).toBe(KIT_PROPOSAL_POLICY_SCHEMA);
    expect(KIT_PROPOSAL_POLICY.envelope).toBe("skillx.kit-proposal/v1");
    expect(vectors.policy).toBe(KIT_PROPOSAL_POLICY_SCHEMA);
  });

  it("keeps every list sorted, unique and already normalized", () => {
    const { exact, contains } = KIT_PROPOSAL_POLICY.forbiddenKeys;
    for (const list of [exact, contains, KIT_PROPOSAL_POLICY.content.refusing]) expect(list).toEqual(sortedUnique(list));
    for (const name of [...exact, ...contains]) expect(normalizeProposalKey(name)).toBe(name);
  });

  it("never refuses a field of the envelope itself", () => {
    const fields = ["schema", "fromRevisionId", "skill", "identity", "base", "package", "version", "releaseDigest", "overlay", "baseTreeDigest", "ops", "op", "path", "contentBase64", "mode", "expectSha256", "patch", "compositionDigest", "declaredPermissions", "evidence", "summary", "signals", "visibility"];
    expect(fields.filter(isForbiddenProposalKey)).toEqual([]);
  });
});

describe("forbidden key vectors", () => {
  it.each(vectors.keys.map((v) => [v.name, v] as const))("%s", (_name, v) => {
    const found = findForbiddenProposalKey(v.value, 32);
    expect(found === null ? null : found.path).toBe(v.refusedAt);
    if (found !== null) expect(found.reason).toBe("forbidden");
  });

  it("normalizes case, separators, encodings and NFKC forms to one name", () => {
    for (const key of ["systemPrompt", "SYSTEM_PROMPT", "system-prompt", "system.prompt", "System Prompt", "%73ystemPrompt", "%2573ystemPrompt", "ｓｙｓｔｅｍＰｒｏｍｐｔ"]) {
      expect(normalizeProposalKey(key)).toBe("systemprompt");
    }
    expect(normalizeProposalKey("pro​mpt")).toBeNull();
    expect(normalizeProposalKey("%E2%80%8Bprompt")).toBeNull();
    expect(normalizeProposalKey("x".repeat(65))).toBeNull();
    // The length counts code points, so 64 astral characters are within the limit (and refused as non-ASCII).
    expect([..."😀".repeat(64)].length).toBe(64);
    expect(normalizeProposalKey("😀".repeat(64))).toBeNull();
  });

  it("bounds the nesting, also through embedded JSON", () => {
    let deep: unknown = {};
    for (let i = 0; i < 40; i++) deep = { a: deep };
    expect(findForbiddenProposalKey(deep, 32)).toMatchObject({ reason: "too_deep" });
    let text = "{}";
    // Each level is an object holding the previous level as a JSON string (escaping doubles per level).
    for (let i = 0; i < 12; i++) text = JSON.stringify({ a: text });
    expect(findForbiddenProposalKey({ summary: text }, 32)).toBeNull();
    expect(findForbiddenProposalKey({ summary: text }, 8)).toMatchObject({ reason: "too_deep" });
  });
});
