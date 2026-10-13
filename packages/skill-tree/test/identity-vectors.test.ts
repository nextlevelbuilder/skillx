import { describe, expect, it } from "vitest";
import {
  IDENTITY_PATTERN,
  SkillTreeError,
  checkAlias,
  checkDirectoryAlias,
  checkPublisher,
  directoryAliasKey,
  frontmatterExposure,
  kitIdentity,
  skillFileExposure,
  trustOf,
  validateIdentity,
} from "../src/index";
import { fixtureBytes } from "./vector-helpers";

interface IdentityVectors {
  schema: string;
  spec: string;
  notes: string[];
  pattern: string;
  kitMapping: Array<{ kit: string; dir: string; identity?: string; portableAlias?: string; error?: string }>;
  valid: string[];
  invalid: Array<{ value: string; error: string }>;
  provenance: Array<{
    identity: string;
    provider: string;
    origin?: string;
    verified?: boolean;
    overlay?: boolean;
    expect: { trust?: string; error?: string };
  }>;
  aliases: Array<{ identity: string; alias: string; error: string | null }>;
  directoryAliases: Array<{ identity: string; alias: string; error: string | null; groupKey?: string }>;
  directoryAliasCollisions: Array<{ aliases: string[]; collide: boolean }>;
  exposure: Array<{ frontmatter?: string; file?: string; exposure: string; warning: boolean }>;
}

const v = JSON.parse(fixtureBytes("vectors/identity-v1-vectors.json").toString("utf8")) as IdentityVectors;

/** The contract code a call throws, or null when it succeeds. */
function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (err) {
    if (err instanceof SkillTreeError) return err.code;
    throw err;
  }
}

describe("identity-v1 vectors (vendored unedited from AgentKit)", () => {
  it("is the expected vector file with every section", () => {
    expect(v.schema).toBe("agentkit.identity-vectors/v1");
    // RegExp.source escapes "/", so compare the compiled patterns.
    expect(new RegExp(v.pattern).source).toBe(IDENTITY_PATTERN.source);
    for (const section of [v.kitMapping, v.valid, v.invalid, v.provenance, v.aliases, v.directoryAliases, v.directoryAliasCollisions, v.exposure]) {
      expect(section.length).toBeGreaterThan(0);
    }
  });

  it("maps kit skill directories", () => {
    for (const c of v.kitMapping) {
      if (c.error !== undefined) expect(codeOf(() => kitIdentity(c.dir)), c.dir).toBe(c.error);
      else expect(kitIdentity(c.dir), c.dir).toEqual({ identity: c.identity, alias: c.portableAlias });
    }
  });

  it("validates identities", () => {
    for (const id of v.valid) expect(codeOf(() => validateIdentity(id)), id).toBeNull();
    for (const c of v.invalid) {
      expect(codeOf(() => validateIdentity(c.value)), c.value).toBe(c.error);
      expect(codeOf(() => checkPublisher(c.value, "kit")), c.value).toBe(c.error);
    }
  });

  it("derives trust or rejects provenance in contract order", () => {
    for (const c of v.provenance) {
      const p = { provider: c.provider, origin: c.origin ?? "", verified: c.verified ?? false, overlay: c.overlay ?? false };
      const label = `${c.identity} ${JSON.stringify(p)}`;
      if (c.expect.error !== undefined) expect(codeOf(() => trustOf(c.identity, p)), label).toBe(c.expect.error);
      else expect(trustOf(c.identity, p), label).toBe(c.expect.trust);
    }
  });

  it("checks invocation aliases", () => {
    for (const c of v.aliases) expect(codeOf(() => checkAlias(c.identity, c.alias)), `${c.identity} ${c.alias}`).toBe(c.error);
  });

  it("checks directory aliases and their group keys", () => {
    for (const c of v.directoryAliases) {
      expect(codeOf(() => checkDirectoryAlias(c.identity, c.alias)), `${c.identity} ${c.alias}`).toBe(c.error);
      if (c.error === null) expect(directoryAliasKey(c.alias)).toBe(c.groupKey);
    }
    for (const c of v.directoryAliasCollisions) {
      const [a = "", b = ""] = c.aliases;
      expect(directoryAliasKey(a) === directoryAliasKey(b), c.aliases.join(" ")).toBe(c.collide);
    }
  });

  it("derives exposure from frontmatter and whole skill files", () => {
    for (const c of v.exposure) {
      expect((c.frontmatter === undefined) !== (c.file === undefined)).toBe(true);
      const got = c.frontmatter !== undefined ? frontmatterExposure(c.frontmatter) : skillFileExposure(c.file ?? "");
      expect(got, JSON.stringify(c.frontmatter ?? c.file)).toEqual({ exposure: c.exposure, warning: c.warning });
    }
  });
});

describe("identity rules beyond the vectors", () => {
  it("never folds look-alikes into reserved aliases", () => {
    for (const alias of ["aK-plan", "аk-plan", "plan-é", "ık-plan", "/аk:plan"]) {
      expect(codeOf(() => checkAlias("@evil/plan", alias)), alias).toBe("identity.invalid");
      expect(codeOf(() => checkAlias("@agentkit/plan", alias)), alias).toBe("identity.invalid");
    }
  });

  it("reserves ak- and ak: segments after leading / and $", () => {
    for (const alias of ["$AK:plan", "/AK:plan", "$ak-plan", "x/$ak-plan", "core/$$AK-plan", "a/b/Ak:c"]) {
      expect(codeOf(() => checkAlias("@acme/plan", alias)), alias).toBe("identity.reserved_alias");
    }
    for (const alias of ["a$ak:plan", "x/bak-plan", "akx/plan", "ak/plan"]) {
      expect(codeOf(() => checkAlias("@acme/plan", alias)), alias).toBeNull();
    }
  });

  it("checks the provider before the reserved publisher", () => {
    expect(codeOf(() => trustOf("@agentkit/plan", { provider: "npm" }))).toBe("identity.invalid");
    expect(codeOf(() => trustOf("@agentkit/plan", { provider: "skillx", verified: true }))).toBe("identity.reserved_publisher");
    expect(codeOf(() => checkPublisher("@agentkit2/plan", "skillx"))).toBeNull();
  });
});
