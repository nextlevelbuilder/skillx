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
});
