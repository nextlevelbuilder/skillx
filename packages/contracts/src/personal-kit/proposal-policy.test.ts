import { describe, expect, it } from "vitest";
import vectors from "../fixtures/kit-proposal-policy-vectors-v1.json";
import { KIT_PROPOSAL_POLICY, KIT_PROPOSAL_POLICY_SCHEMA, findForbiddenProposalKey, isForbiddenProposalKey, normalizeProposalKey, secretKeyKind } from "./proposal-policy";

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

  it("folds only fullwidth forms through NFKC and pins the Unicode version", () => {
    expect(KIT_PROPOSAL_POLICY.forbiddenKeys.unicodeVersion).toBe("15.0");
    expect(normalizeProposalKey("ＴＯＫＥＮ")).toBe("token");
    // A compatibility ligature outside the fullwidth block is refused, not folded.
    expect(normalizeProposalKey("ﬁle")).toBeNull();
    expect(normalizeProposalKey("%2525252573ession")).toBeNull();
    expect(normalizeProposalKey("100%")).toBe("100");
  });

  it("writes unambiguous key paths and never echoes a long key", () => {
    expect(findForbiddenProposalKey({ "a.b": { transcript: "x" } }, 32)?.path).toBe('proposal["a.b"].transcript');
    expect(findForbiddenProposalKey({ "a[0]": { transcript: "x" } }, 32)?.path).toBe('proposal["a[0]"].transcript');
    expect(findForbiddenProposalKey({ ["t".repeat(65)]: "x" }, 32)?.path).toBe("proposal[…]");
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

describe("secret key names of the content rules", () => {
  it("names password and secret keys in any case and separator style", () => {
    for (const key of ["password", "dbPassword", "DB_PASSWORD", "db-passwd", "userPwd", "sshPassphrase"]) expect(secretKeyKind(key)).toBe("password");
    for (const key of ["apiKey", "API_KEY", "clientSecret", "client_secret", "GITHUB_TOKEN", "accessToken", "awsCredentials", "privateKey"]) expect(secretKeyKind(key)).toBe("secret");
  });

  it("matches a stem at the end of the key, anywhere only on a dotenv line", () => {
    expect(secretKeyKind("tokenizer")).toBeNull();
    expect(secretKeyKind("passwordHint")).toBeNull();
    expect(secretKeyKind("TOKEN_URL")).toBeNull();
    expect(secretKeyKind("TOKEN_URL", true)).toBe("secret");
    expect(secretKeyKind("PASSWORD_FILE", true)).toBe("password");
  });

  it("allows at most two qualifiers after a stem", () => {
    for (const key of ["secret_key_base", "api_key_prod", "private_key_id", "client_secret_v2", "passwordValue", "API_KEY_PROD_V2"]) expect(secretKeyKind(key)).not.toBeNull();
    for (const key of ["secretName", "secretsManager", "passwordless", "passwordPolicy", "token_count", "api_key_prod_v2_old"]) expect(secretKeyKind(key)).toBeNull();
  });

  it("treats a key that cannot be normalized as a secret key", () => {
    expect(secretKeyKind("pаssword")).toBe("secret");
    expect(secretKeyKind("k".repeat(65))).toBe("secret");
  });
});
