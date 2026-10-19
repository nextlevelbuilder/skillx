import { describe, expect, it } from "vitest";
import { findSyncLeaks, hasAbsolutePath, hasSecretToken } from "./sync-leaks";
import { collectionRevisionDigest, validateCollectionContent } from "./collection-revision";

describe("sync-leak scanner", () => {
  it.each([
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "Authorization: Bearer abcdefghijklmnop1234",
    "https://user:hunter22@example.com/repo.git",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig",
    "ghp_0123456789abcdefghijklmnopqrstuvwxyz",
    "sk-ant-api03-abcdefghijklmnopqrstuvwx",
    "AKIAABCDEFGHIJKLMNOP",
    "sx_abcdefghijklmnopqrstuv",
  ])("flags the credential %#", (text) => {
    expect(hasSecretToken(text)).toBe(true);
  });

  it.each(["/home/alice/.claude/skills", "/Users/bob/x", "C:\\Users\\carol", "~/notes", "\\\\server\\share", "file:///etc/passwd", "path=/home/x/y"])(
    "flags the absolute path %s",
    (text) => expect(hasAbsolutePath(text)).toBe(true),
  );

  it.each(["scripts/run.sh", "@alpha/demo", "sha256:" + "a".repeat(64), "https://github.com/a/b", "claude-code", "1.2.3"])("passes %s", (text) => {
    expect(hasSecretToken(text) || hasAbsolutePath(text)).toBe(false);
  });

  it("reports paths and rules, never the matched text", () => {
    const leaks = findSyncLeaks({ config: { apiKey: "abcdef123456", home: "/home/me", ok: "fine" }, list: ["x", "ghp_0123456789abcdefghijklmnopqrstuvwxyz"] });
    expect(leaks).toEqual([
      { path: "config.apiKey", rule: "secret-key" },
      { path: "config.home", rule: "absolute-path" },
      { path: "list[1]", rule: "secret-token" },
    ]);
    expect(JSON.stringify(leaks)).not.toContain("abcdef123456");
  });
});

describe("collection revision content", () => {
  const member = { packageName: "@alpha/demo", version: "1.0.0" };

  it("accepts members and scalar config, and digests independent of member order", async () => {
    const a = { members: [member, { packageName: "@alpha/zed" }], config: { scope: "user" } };
    const b = { members: [{ packageName: "@alpha/zed" }, member], config: { scope: "user" } };
    expect(validateCollectionContent(a).valid).toBe(true);
    expect(await collectionRevisionDigest(a)).toBe(await collectionRevisionDigest(b));
  });

  it("refuses duplicates, digest pins without version, nested config, secrets and paths", () => {
    const result = validateCollectionContent({
      members: [member, member, { packageName: "@alpha/x", digest: "sha256:" + "b".repeat(64) }],
      config: { nested: { a: 1 }, token: "abcdefgh1234", dir: "C:\\Users\\me" } as never,
    });
    const codes = result.issues.map((i) => `${i.path}:${i.code}`);
    expect(codes).toEqual(
      expect.arrayContaining(["members[1].packageName:duplicate", "members[2].digest:required", "config.nested:type", "config.token:sync.secret-key", "config.dir:sync.absolute-path"]),
    );
  });
});
