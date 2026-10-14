import { describe, expect, it } from "vitest";
import { addedLines, genericSecrets, hasByteOrderMark, hasLocalPath, hasMultilinePassword } from "~/lib/personal-kits/proposal-detectors";
import { sharedSkills } from "~/lib/personal-kits/kit-verify";
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
    // Every absolute POSIX path outside the system allowlist.
    "/opt/acme/bin/tool",
    "/opt/homebrew/bin/node",
    "/srv/client/data",
    "/var/www/site",
    "cd /workspaces/acme-internal",
    "/data/exports/x.csv",
    "/nix/store/abc-pkg",
    "/Applications/Tool.app/x",
    "path:/workspace/acme",
    // Case variants of the user and temp roots.
    "/users/kai/repo",
    "/USERS/kai",
    "cd /TMP",
    "/Home/kai",
    // Forward-slash UNC and SMB.
    "//host/share/x",
    "see //fileserver/public",
    "smb://host/share",
    "SMB://host/share",
    "FILE:///etc/passwd",
    // Percent-encoded separators.
    "%2Fhome%2Fkai%2Fx",
    "%2fsrv%2fclient%2fx",
    "%5C%5Chost%5Cshare",
    "C%3A%5CUsers%5Ckai",
    "%252Fhome%252Fkai",
    // Climbing out of a system root.
    "/usr/bin/../../home/kai",
    "/etc/../srv/x",
    "/dev/sda1/x",
    "/dev/null/x",
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
    // The system allowlist, in any case.
    "#!/bin/sh",
    "/usr/local/bin/tool",
    "/sbin/ifconfig",
    "edit /etc/hosts",
    "/proc/self/status",
    "cmd 2>/dev/null",
    "read /dev/stdin, write /dev/stdout and /dev/stderr",
    "/USR/BIN/env",
    "https://example.com/var/www/x?y=%2Fz",
    "dates 12/31/2025 and 1/2",
    "run /ak:plan now",
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

describe("multi-line YAML password detector", () => {
  const value = "hunter" + "22";
  it.each([
    `db:\n  password:\n    ${value}\n`,
    `password: |\n  ${value}\n`,
    `password: >-\n  ${value}\n  more\n`,
    `PASSWORD:\n\n  ${value}\n`,
  ])("finds %j", (text) => expect(hasMultilinePassword(null, text)).toBe(true));

  it.each(["password: |\n  <your-password>\n", "password:\n  ${DB_PASSWORD}\n", "password:\nnext: 1\n", "password: |\n  ab\n"])(
    "ignores %j",
    (text) => expect(hasMultilinePassword(null, text)).toBe(false),
  );

  it("finds a new value under a key the base already has, not a block kept from the base", () => {
    const base = "db:\n  password:\n    <set-me>\n";
    expect(hasMultilinePassword(base, `db:\n  password:\n    ${value}\n`)).toBe(true);
    const kept = `db:\n  password:\n    ${value}\n`;
    expect(hasMultilinePassword(kept, `${kept}other: 1\n`)).toBe(false);
  });
});

describe("shared skill guard", () => {
  it("treats every ak- and ak: skill as shared when unset, and adds the configured list", () => {
    const unset = sharedSkills({});
    expect(unset("@agentkit/ak-plan", "ak-plan")).toBe(true);
    expect(unset("@agentkit/plan", "AK:plan")).toBe(true);
    expect(unset("@agentkit/AK-x", "x")).toBe(true);
    expect(unset("@agentkit/plan", "plan")).toBe(false);
    expect(unset("@agentkit/akplan", "akplan")).toBe(false);
    const listed = sharedSkills({ SKILLX_SHARED_SKILL_ALIASES: "@agentkit/plan,\n@agentkit/cook" });
    expect(listed("@agentkit/plan", "plan")).toBe(true);
    expect(listed("@agentkit/cook", "cook")).toBe(true);
    expect(listed("@agentkit/ak-review", "ak-review")).toBe(true);
    expect(listed("@agentkit/other", "other")).toBe(false);
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
