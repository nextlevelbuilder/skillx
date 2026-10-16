import { describe, expect, it } from "vitest";
import { PersonalKitError } from "./codes";
import { revisionDigest, validateKitDocument } from "./kit-document";
import golden from "../fixtures/personal-kit-composition-golden.json";
import plain from "../fixtures/personal-kit-golden.json";

const D = (c: string) => `sha256:${c.repeat(64)}`;
const record = golden.document.composition.resolutions[0]!;
const withComposition = (composition: unknown): Record<string, unknown> => ({ ...structuredClone(plain.document), composition });
const base = golden.document.composition;
const code = (composition: unknown) => {
  try {
    validateKitDocument(withComposition(composition));
    return "ok";
  } catch (error) {
    return error instanceof PersonalKitError ? `${error.code} ${error.path}` : String(error);
  }
};

describe("revision document composition", () => {
  it("is part of the revision digest, and leaves a document without it on its old digest", async () => {
    const doc = validateKitDocument(structuredClone(golden.document));
    expect(doc).toEqual(golden.document);
    expect(await revisionDigest(doc)).toBe(golden.expected.revisionDigest);
    const { composition, ...without } = structuredClone(golden.document);
    expect(composition).toBeDefined();
    expect(await revisionDigest(validateKitDocument(without))).toBe(golden.expected.withoutCompositionDigest);
    expect(golden.expected.withoutCompositionDigest).toBe(plain.expected.revisionDigest);
  });

  it("accepts extends alone, either source kind, and every choice", () => {
    expect(code({ extends: [{ kit: "engineer", version: "3.1.0" }] })).toBe("ok");
    expect(code({ extends: [{ skillx: "@alpha/base", version: "1.0.0", releaseDigest: D("1") }], include: [] , resolutions: [] })).toBe("ok");
    for (const choice of ["keep-old", "use-upstream", "edit-overlay"]) expect(code({ ...base, resolutions: [{ ...record, choice }] })).toBe("ok");
    const fork = { ...record, identity: "@local/my-plan", choice: "fork", fork: { identity: "@local/my-plan", alias: "my-plan" } };
    expect(code({ ...base, resolutions: [fork] })).toBe("ok");
  });

  it("refuses malformed composition at the offending path, never normalizing it", () => {
    const at = (path: string) => `kit.invalid composition${path}`;
    expect(code([])).toBe(at(""));
    expect(code({ ...base, extra: 1 })).toBe(at(".extra"));
    expect(code({ include: [] })).toBe(at(".extends"));
    expect(code({ extends: [] })).toBe(at(".extends"));
    expect(code({ extends: Array.from({ length: 17 }, (_, i) => ({ kit: `k${i}`, version: "1.0.0" })) })).toBe(at(".extends"));
    expect(code({ extends: [{ kit: "engineer", version: "^3.1.0" }] })).toBe(at(".extends[0].version"));
    expect(code({ extends: [{ kit: "Engineer", version: "3.1.0" }] })).toBe(at(".extends[0].kit"));
    expect(code({ extends: [{ kit: "engineer", skillx: "@a/b", version: "3.1.0" }] })).toBe(at(".extends[0]"));
    expect(code({ extends: [{ skillx: "@a/b", version: "3.1.0" }] })).toBe(at(".extends[0].releaseDigest"));
    expect(code({ extends: [{ kit: "engineer", version: "3.1.0" }, { kit: "engineer", version: "3.2.0" }] })).toBe(at(".extends[1]"));
    expect(code({ ...base, include: ["@alpha/demo", "@alpha/demo"] })).toBe(at(".include[1]"));
    expect(code({ ...base, include: ["demo"] })).toBe(at(".include[0]"));
    expect(code({ ...base, resolutions: [record, record] })).toBe(at(".resolutions[1]"));
    expect(code({ ...base, resolutions: [{ ...record, choice: "auto" }] })).toBe(at(".resolutions[0].choice"));
    expect(code({ ...base, resolutions: [{ ...record, approvedBy: "agent" }] })).toBe(at(".resolutions[0].approvedBy"));
    expect(code({ ...base, resolutions: [{ ...record, category: "same_hunk" }] })).toBe(at(".resolutions[0].category"));
    expect(code({ ...base, resolutions: [{ ...record, baseTo: "missing" }] })).toBe(at(".resolutions[0].baseTo"));
    expect(code({ ...base, resolutions: [{ ...record, path: "a\nb" }] })).toBe(at(".resolutions[0].path"));
    expect(code({ ...base, resolutions: [{ ...record, transcript: "x" }] })).toBe(at(".resolutions[0].transcript"));
    expect(code({ ...base, resolutions: [{ ...record, choice: "fork" }] })).toBe(at(".resolutions[0].fork"));
    expect(code({ ...base, resolutions: [{ ...record, fork: { identity: record.identity, alias: "x" } }] })).toBe(at(".resolutions[0].fork"));
    const otherFork = { ...record, choice: "fork", fork: { identity: "@local/other", alias: "other" } };
    expect(code({ ...base, resolutions: [otherFork] })).toBe(at(".resolutions[0].fork.identity"));
  });
});
