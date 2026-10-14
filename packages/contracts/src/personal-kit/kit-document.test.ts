import { describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical-json";
import { PersonalKitError } from "./codes";
import { encodeBase64, utf8 } from "./bytes";
import { revisionDigest, sharedAliasViolation, validateKitDocument } from "./kit-document";
import type { PersonalKitDocument } from "./kit-document";
import { buildKitLock, publicDerivativeViolation, resolveLineage } from "./kit-lock";
import { emptyOverlay } from "./overlay-envelope";

const D = (c: string) => `sha256:${c.repeat(64)}`;
const entry = (identity: string, extra: Record<string, unknown> = {}) => ({
  identity,
  mode: "override",
  base: { package: identity, version: "1.0.0", releaseDigest: D("2") },
  overlay: emptyOverlay(D("2")),
  compositionDigest: D("2"),
  ...extra,
});
const doc = (extra: Record<string, unknown> = {}): Record<string, unknown> => JSON.parse(JSON.stringify({
  schema: "skillx.personal-kit/v1",
  kit: "@alpha/my-kit",
  localId: "local/my-kit",
  visibility: "private",
  skills: [entry("@alpha/one"), entry("@beta/two")],
  exclude: [],
  runtimes: { claude: ">=1.0.0" },
  ...extra,
}));
const code = (input: unknown) => {
  try {
    validateKitDocument(input);
    return "ok";
  } catch (error) {
    return error instanceof PersonalKitError ? error.code : String(error);
  }
};
const addOp = { op: "add", path: "x.md", contentBase64: encodeBase64(utf8("x\n")) };

describe("validateKitDocument", () => {
  it("accepts a valid document and pins its digest", async () => {
    const valid = validateKitDocument(doc());
    expect(await revisionDigest(valid)).toBe(await revisionDigest(validateKitDocument(JSON.parse(canonicalJson(doc())))));
    expect(await revisionDigest(valid)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rejects unknown fields, bad schema versions and multi-parent lineage", () => {
    expect(code(doc({ extra: 1 }))).toBe("kit.invalid");
    expect(code(doc({ schema: "skillx.personal-kit/v2" }))).toBe("schema.unsupported_version");
    expect(code(doc({ parent: [{ kit: "@a/b", revisionDigest: D("3") }] }))).toBe("kit.multi_parent");
    expect(code(doc({ parent: { kit: "@alpha/my-kit", revisionDigest: D("3") } }))).toBe("kit.cycle");
    expect(code(doc({ localId: "local/other" }))).toBe("kit.invalid");
    expect(code(doc({ runtimes: { claude: "^1.0.0" } }))).toBe("kit.invalid");
  });

  it("enforces ordering, identity uniqueness and alias collisions", () => {
    expect(code(doc({ skills: [entry("@beta/two"), entry("@alpha/one")] }))).toBe("kit.invalid");
    expect(code(doc({ skills: [entry("@alpha/one"), entry("@alpha/one")] }))).toBe("kit.duplicate_identity");
    expect(code(doc({ skills: [entry("@alpha/one"), entry("@beta/one")] }))).toBe("kit.alias_collision");
  });

  it("enforces extend, override and fork rules", () => {
    expect(code(doc({ skills: [entry("@alpha/one", { mode: "extend", overlay: { ...emptyOverlay(D("2")), ops: [addOp] } })] }))).toBe("ok");
    const del = { op: "delete", path: "x.md", expectSha256: "a".repeat(64) };
    expect(code(doc({ skills: [entry("@alpha/one", { mode: "extend", overlay: { ...emptyOverlay(D("2")), ops: [del] } })] }))).toBe("kit.mode_violation");
    expect(code(doc({ skills: [entry("@alpha/one", { base: { package: "@beta/one", version: "1.0.0", releaseDigest: D("2") } })] }))).toBe("kit.mode_violation");
    const fork = { mode: "fork", base: { package: "@agentkit/plan", version: "1.0.0", releaseDigest: D("2") }, alias: "my-plan" };
    expect(code(doc({ skills: [entry("@alpha/plan", fork)] }))).toBe("ok");
    expect(code(doc({ skills: [entry("@beta/plan", fork)] }))).toBe("kit.mode_violation");
    expect(code(doc({ skills: [entry("@alpha/plan", { ...fork, alias: "ak-plan" })] }))).toBe("identity.reserved_alias");
    expect(code(doc({ skills: [entry("@alpha/plan", { ...fork, alias: undefined })] }))).toBe("kit.mode_violation");
  });

  it("refuses overlays only on shared skills (AgentKit overlay.shared_alias)", () => {
    const overlaid = entry("@agentkit/plan", { overlay: { ...emptyOverlay(D("2")), ops: [addOp] } });
    const shared = (id: string) => id === "@agentkit/plan";
    // An official skill that is not shared may be overlaid in place.
    expect(code(doc({ skills: [overlaid] }))).toBe("ok");
    expect(sharedAliasViolation(validateKitDocument(doc({ skills: [overlaid] })), () => false)).toBeNull();
    expect(sharedAliasViolation(validateKitDocument(doc({ skills: [overlaid] })), shared)?.code).toBe("overlay.shared_alias");
    expect(sharedAliasViolation(validateKitDocument(doc({ skills: [entry("@agentkit/plan")] })), shared)).toBeNull();
    // The predicate also sees the directory alias of the entry.
    const aliases: string[] = [];
    sharedAliasViolation(validateKitDocument(doc({ skills: [overlaid] })), (_id, alias) => (aliases.push(alias), false));
    expect(aliases).toEqual(["plan"]);
  });

  it("validates every identity segment, not only the pattern", () => {
    const long = "a".repeat(65);
    expect(code(doc({ kit: `@alpha/${long}`, localId: `local/${long}` }))).toBe("kit.invalid");
    expect(code(doc({ kit: `@alpha/${"a".repeat(64)}`, localId: `local/${"a".repeat(64)}` }))).toBe("ok");
  });

  it("gives a local id only to a kit name that is an AgentKit kit ID", () => {
    for (const name of ["my.kit", "my_kit", "my--kit", "my-kit-"]) {
      expect(code(doc({ kit: `@alpha/${name}`, localId: undefined }))).toBe("ok");
      expect(code(doc({ kit: `@alpha/${name}`, localId: `local/${name}` }))).toBe("kit.invalid");
    }
  });

  it("sorts and de-duplicates exclude, so equivalent documents share one digest", async () => {
    const messy = validateKitDocument(doc({ exclude: ["@gamma/three", "@alpha/zero", "@gamma/three"] }));
    expect(messy.exclude).toEqual(["@alpha/zero", "@gamma/three"]);
    expect(await revisionDigest(messy)).toBe(await revisionDigest(validateKitDocument(doc({ exclude: ["@alpha/zero", "@gamma/three"] }))));
  });
});

describe("lineage and lock", () => {
  const parent = validateKitDocument(doc({ kit: "@alpha/base-kit", localId: undefined, skills: [entry("@alpha/one"), entry("@gamma/three")] }));
  const child = validateKitDocument(
    doc({ parent: { kit: "@alpha/base-kit", revisionDigest: D("4") }, exclude: ["@gamma/three"], skills: [entry("@beta/two")] }),
  );

  it("resolves inheritance, exclusion and ownership", () => {
    const effective = resolveLineage([child, parent]);
    expect(effective.map((e) => `${e.entry.identity}<-${e.owner}`)).toEqual(["@alpha/one<-@alpha/base-kit", "@beta/two<-@alpha/my-kit"]);
  });

  it("detects broken and cyclic chains", () => {
    expect(() => resolveLineage([child])).toThrow(/missing from the chain/);
    const loop = { ...parent, parent: { kit: "@alpha/my-kit", revisionDigest: D("5") } } as PersonalKitDocument;
    expect(() => resolveLineage([child, loop, child])).toThrow(/appears twice/);
  });

  it("builds a deterministic lock", async () => {
    const a = await buildKitLock([child, parent], { id: "rev_1", number: 2, digest: D("6") });
    const b = await buildKitLock([child, parent], { id: "rev_1", number: 2, digest: D("6") });
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(a.entries.map((e) => e.owner)).toEqual(["personal:@alpha/base-kit", "personal:@alpha/my-kit"]);
    expect(a).toMatchObject({ schema: "skillx.personal-kit-lock/v1", resolver: "skillx.kit-resolver/1", localId: "local/my-kit" });
  });

  it("refuses public derivatives of private or paid bases", () => {
    const pub = validateKitDocument(doc({ visibility: "public" }));
    expect(publicDerivativeViolation(pub, (p) => p !== "@beta/two", true)).toMatch(/@beta\/two/);
    expect(publicDerivativeViolation(pub, () => true, true)).toBeNull();
    expect(publicDerivativeViolation(validateKitDocument(doc()), () => false, false)).toBeNull();
  });
});
