import { describe, expect, it } from "vitest";
import { INSTALL_LOCK_SCHEMA, INSTALL_RESOLVER_VERSION, lockDigest, lockOwnerKey, validateInstallLock } from "./install-lock";
import type { InstallLock } from "./install-lock";

const D = (c: string) => `sha256:${c.repeat(64)}`;
const lock = (): InstallLock => ({
  schema: INSTALL_LOCK_SCHEMA,
  resolver: INSTALL_RESOLVER_VERSION,
  source: { kind: "kit", kit: "@alpha/my-kit", revisionId: "rev_00000000-0000-4000-8000-000000000001", revisionNumber: 2, revisionDigest: D("a") },
  runtimes: { "claude-code": ">=1.0.0" },
  packages: [
    { alias: "demo", package: "@alpha/demo", version: "1.0.0", releaseDigest: D("b"), compositionDigest: D("b"), overlayDigests: [] },
    { alias: "zed", package: "@alpha/zed", version: "2.0.0", releaseDigest: D("c"), compositionDigest: D("d"), overlayDigests: [D("e")] },
  ],
});

describe("skillx.lock/v1", () => {
  it("validates a well-formed lock and digests it deterministically", async () => {
    expect(validateInstallLock(lock())).toEqual({ valid: true, issues: [] });
    const { packages, ...rest } = lock();
    const reordered = JSON.parse(JSON.stringify({ packages, ...rest }));
    expect(await lockDigest(reordered)).toBe(await lockDigest(lock()));
    expect(lockOwnerKey(lock().source, lock().packages)).toBe("kit:@alpha/my-kit");
  });

  it("rejects unsorted or duplicate aliases, unknown fields and composed digests without overlay", () => {
    const bad = lock();
    bad.packages.reverse();
    (bad as unknown as Record<string, unknown>).extra = 1;
    bad.packages[1]!.compositionDigest = D("f");
    const codes = validateInstallLock(bad).issues.map((i) => `${i.path}:${i.code}`);
    expect(codes).toEqual(expect.arrayContaining(["extra:unknown_field", "packages[1].alias:order", "packages[1].compositionDigest:mismatch"]));
  });

  it("refuses a lock that would sync a secret or an absolute path", () => {
    const leaky = lock() as unknown as { runtimes: Record<string, string> };
    leaky.runtimes = { "claude-code": "/home/alice/bin/claude" };
    const issues = validateInstallLock(leaky).issues;
    expect(issues).toContainEqual(expect.objectContaining({ path: "runtimes.claude-code", code: "sync.absolute-path" }));
  });

  it("rejects an unknown source kind and a malformed version", () => {
    const bad = lock() as unknown as { source: unknown; packages: Array<{ version: string }> };
    bad.source = { kind: "git" };
    bad.packages[0]!.version = "latest";
    const codes = validateInstallLock(bad).issues.map((i) => i.path);
    expect(codes).toEqual(expect.arrayContaining(["source.kind", "packages[0].version"]));
  });

  describe("added skills", () => {
    const C = "a".repeat(40);
    const added = () => ({
      ...lock(),
      source: { kind: "packages" as const },
      runtimes: {},
      added: [
        { alias: "lint", repository: "https://github.com/acme/skills.git", path: "skills/lint", ref: "v1.2", commit: C, treeDigest: D("1") },
        { alias: "pdf", repository: "https://git.example.com/team/skills.git", path: "", commit: C, treeDigest: D("2") },
      ],
    });

    it("accepts pinned git skills next to packages in a packages lock", () => {
      expect(validateInstallLock(added())).toEqual({ valid: true, issues: [] });
      const pinned = added();
      pinned.added[0]!.ref = C;
      expect(validateInstallLock(pinned).valid).toBe(true);
    });

    it("refuses credentials, unsafe paths, short commits, a kit scope and an alias shared with a package", () => {
      const bad = added() as unknown as { source: unknown; added: Array<Record<string, unknown>> };
      bad.source = lock().source;
      bad.added[0]!.repository = "https://user:token@github.com/acme/skills.git";
      bad.added[0]!.path = "../escape";
      bad.added[1]!.commit = "abc1234";
      bad.added[1]!.alias = "zed";
      bad.added[1]!.extra = true;
      const codes = validateInstallLock(bad).issues.map((i) => `${i.path}:${i.code}`);
      expect(codes).toEqual(
        expect.arrayContaining(["added:scope", "added[0].repository:pattern", "added[0].path:pattern", "added[1].commit:pattern", "added[1].alias:duplicate", "added[1].extra:unknown_field"]),
      );
    });

    it("refuses http, unsorted entries, a commit ref that is not the commit and an empty list", () => {
      const bad = added();
      bad.added[0]!.repository = "http://github.com/acme/skills.git";
      bad.added[1]!.ref = "b".repeat(40);
      bad.added.reverse();
      const codes = validateInstallLock(bad).issues.map((i) => `${i.path}:${i.code}`);
      expect(codes).toEqual(expect.arrayContaining(["added[1].repository:pattern", "added[0].ref:mismatch", "added[1].alias:order"]));
      expect(validateInstallLock({ ...added(), added: [] }).issues.map((i) => i.path)).toEqual(["added"]);
    });
  });
});
