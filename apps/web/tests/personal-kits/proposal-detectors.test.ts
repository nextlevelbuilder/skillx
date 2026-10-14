import { describe, expect, it } from "vitest";
import { addedLines, genericSecrets, hasByteOrderMark, hasLocalPath } from "~/lib/personal-kits/proposal-detectors";
import { assertNoForbiddenKeys } from "~/lib/personal-kits/proposal-envelope";

describe("absolute local path detector", () => {
  it.each([
    String.raw`"cwd": "C:\\Users\\kai\\repo"`,
    String.raw`D:\www\project\notes.md`,
    "d:/data/file",
    String.raw`share \\srv01\public\x`,
    String.raw`"\\\\srv01\\share\\x"`,
    "file:///home/kai/x",
    "file://host/share",
    "/mnt/c/Users/kai",
    ">/home/kai/log",
    "</home/kai",
    "{/Users/kai}",
    "|/home/kai",
    ";/home/kai",
    "*/home/kai",
    "/Volumes/Data/x",
    "/var/folders/ab/T/x",
    "see /tmp/build",
    "/private/var/x",
    "/root/.bashrc",
    String.raw`"\/home\/kai\/x"`,
  ])("refuses %s", (text) => expect(hasLocalPath(text)).toBe(true));

  it.each([
    "#!/usr/bin/env node",
    "https://example.com/Users/guide",
    "src/tmp/file",
    "./tmp/x",
    "~/notes",
    "docs/home/page",
    "at 12:30 today",
    "http://localhost:3000/api",
    String.raw`"\\n\\t"`,
    "ratio a:b",
    "/homepage and /tmpl",
  ])("allows %s", (text) => expect(hasLocalPath(text)).toBe(false));
});

describe("generic secret detector", () => {
  // Built at runtime so no credential-shaped literal sits in the source.
  const jwt = ["eyJ", "hbGciOiJIUzI1NiJ9", ".eyJ", "zdWIiOiIxIn0", ".c2ln"].join("");
  it.each([
    ["password=" + "hunter22", "secret-password"],
    ["db_passwd: " + "hunter22", "secret-password"],
    ["Authorization: Bearer " + "a1".repeat(12), "secret-bearer"],
    ["postgres://admin:" + "s3cretpw" + "@db.internal/x", "secret-url-credentials"],
    ["token " + jwt, "secret-jwt"],
    [["-----BEGIN ", "OPENSSH PRIVATE KEY-----"].join(""), "secret-private-key"],
    ["OPENAI_API_KEY=" + "x9".repeat(10), "secret-dotenv"],
    ["export DB_PASSWORD=" + "q".repeat(12), "secret-dotenv"],
  ])("finds %s", (text, rule) => expect(genericSecrets(text)).toContain(rule));

  it.each(["password: <your-password>", "password=${PASSWORD}", "Bearer <token>", "https://example.com/a@b", "API_KEY=", "the password field", "AUTHOR_NAME=Jonathan"])(
    "ignores %s",
    (text) => expect(genericSecrets(text)).toEqual([]),
  );
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
