import { describe, expect, it } from "vitest";
import vectors from "../../../../packages/contracts/src/fixtures/kit-proposal-policy-vectors-v1.json";
import { addedLines, genericSecrets, hasByteOrderMark, hasLocalPath, hasMultilinePassword } from "~/lib/personal-kits/proposal-detectors";
import { sharedSkills } from "~/lib/personal-kits/kit-verify";
import { assertNoForbiddenKeys } from "~/lib/personal-kits/proposal-envelope";

/** The shared `skillx.kit-proposal-policy/v1` content vectors (AgentKit tests against the same file). */
const joined = (v: { parts: string[] }) => v.parts.join("");

describe("absolute local path detector", () => {
  it.each(vectors.localPaths.refuse)("refuses %s", (text) => expect(hasLocalPath(text)).toBe(true));
  it.each(vectors.localPaths.allow)("allows %s", (text) => expect(hasLocalPath(text)).toBe(false));
});

describe("generic secret detector", () => {
  it.each(vectors.secrets.map((v) => [joined(v), v.rules] as const))("finds in %j exactly %j", (text, rules) => expect(genericSecrets(text)).toEqual(rules));
});

describe("multi-line YAML password detector", () => {
  it.each(vectors.multilinePasswords.refuse.map(joined))("finds %j", (text) => expect(hasMultilinePassword(null, text)).toBe(true));
  it.each(vectors.multilinePasswords.allow.map(joined))("ignores %j", (text) => expect(hasMultilinePassword(null, text)).toBe(false));

  it("finds a new value under a key the base already has, not a block kept from the base", () => {
    const value = "hunter" + "22";
    const base = "db:\n  password:\n    <set-me>\n";
    expect(hasMultilinePassword(base, `db:\n  password:\n    ${value}\n`)).toBe(true);
    const kept = `db:\n  password:\n    ${value}\n`;
    expect(hasMultilinePassword(kept, `${kept}other: 1\n`)).toBe(false);
    const list = `users:\n  - password:\n      ${value}\n`;
    expect(hasMultilinePassword(list, `${list}  - name: b\n`)).toBe(false);
  });
});

describe("forbidden keys through the envelope", () => {
  it.each(vectors.keys.map((v) => [v.name, v] as const))("%s", (_name, v) => {
    if (v.refusedAt === null) return expect(() => assertNoForbiddenKeys(v.value)).not.toThrow();
    expect(() => assertNoForbiddenKeys(v.value)).toThrow(`${v.refusedAt} is not accepted`);
  });

  it("never echoes the value", () => {
    const value = "hunter" + "22";
    let message = "";
    try {
      assertNoForbiddenKeys({ evidence: { password: value } });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("proposal.evidence.password");
    expect(message).not.toContain(value);
  });
});

describe("shared skill guard", () => {
  it("treats every @agentkit, ak- and ak: skill as shared when unset, and only ak- plus the list once configured", () => {
    // Aliases, typos and mixed case are not identities, so they leave the list empty.
    for (const unset of [sharedSkills({}), sharedSkills({ SKILLX_SHARED_SKILL_ALIASES: " ,\n" }), sharedSkills({ SKILLX_SHARED_SKILL_ALIASES: "plan none @AgentKit/cook" })]) {
      expect(unset("@agentkit/ak-plan", "ak-plan")).toBe(true);
      expect(unset("@agentkit/plan", "AK:plan")).toBe(true);
      expect(unset("@agentkit/plan", "plan")).toBe(true);
      expect(unset("@agentkit/akplan", "renamed")).toBe(true);
      expect(unset("@alpha/plan", "plan")).toBe(false);
      expect(unset("@alpha/AK-x", "x")).toBe(true);
      expect(unset("@alpha/agentkit", "agentkit")).toBe(false);
    }
    const listed = sharedSkills({ SKILLX_SHARED_SKILL_ALIASES: "@agentkit/plan,\n@agentkit/cook" });
    expect(listed("@agentkit/plan", "plan")).toBe(true);
    expect(listed("@agentkit/cook", "cook")).toBe(true);
    expect(listed("@agentkit/ak-review", "ak-review")).toBe(true);
    expect(listed("@agentkit/other", "other")).toBe(false);
    expect(listed("@agentkit/akplan", "akplan")).toBe(false);
  });
});

describe("helpers", () => {
  it("keeps only the lines a change introduces", () => {
    expect(addedLines("a\nb\nb\n", "a\nb\nnew\nb\nb\n")).toBe("new\nb");
    expect(addedLines(null, "all")).toBe("all");
  });

  it("detects byte order marks", () => {
    expect(hasByteOrderMark(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe(true);
    expect(hasByteOrderMark(new Uint8Array([0xff, 0xfe, 0x41, 0]))).toBe(true);
    expect(hasByteOrderMark(new TextEncoder().encode("plain"))).toBe(false);
  });

  it("bounds the forbidden-key recursion", () => {
    let deep: unknown = {};
    for (let i = 0; i < 40; i++) deep = { a: deep };
    expect(() => assertNoForbiddenKeys(deep)).toThrow(/deeper than 32/);
  });
});
