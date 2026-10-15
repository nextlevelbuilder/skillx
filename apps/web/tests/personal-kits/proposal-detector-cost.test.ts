/**
 * The proposal detectors run in time linear in the text: a request body of
 * about 1 MiB built to make a backtracking pattern quadratic (long separator
 * runs, `a-a-a-...` scheme runs, `eyJ-eyJ-...`, repeated keys) must scan in
 * well under the Worker CPU limit. The bound is generous for slow runners;
 * a quadratic pattern takes minutes on these inputs.
 */
import { describe, expect, it } from "vitest";
import { genericSecrets, hasLocalPath, hasMultilinePassword } from "~/lib/personal-kits/proposal-detectors";

const SIZE = 1024 * 1024;
const fill = (unit: string) => unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE);
const BOUND_MS = 1500;

const HOSTILE: Record<string, string> = {
  "slashes": fill("/"),
  "backslashes": fill("\\"),
  "JSON-escaped slashes": fill("\\/"),
  "percent-encoded slashes": fill("%2F"),
  "double-encoded slashes": fill("%252F"),
  "scheme-like dashes": fill("a-"),
  "scheme-like pluses": fill("a+"),
  "drive-like colons": fill("a:"),
  "JWT-like heads": fill("eyJ-"),
  "dollar segments": fill("/usr/$"),
  "allowed system paths": fill(" /usr/bin/x"),
  "climbing segments": fill("/a/.."),
  "editor links": fill("x://file"),
  "glued flags": fill(" -I"),
  "flag-like dashes": " -" + fill("a"),
  "one long segment": " /" + fill("a"),
  "non-ASCII segments": fill("/é"),
  "UNC-like runs": fill("\\\\ab"),
  "secret key words": fill("TOKEN"),
  "password words": fill("password"),
  "password assignments": fill("password: "),
  "credential URLs": fill("x://a:"),
  "YAML password keys": fill("password:\n"),
  "YAML list password keys": fill("- password:\n  \n"),
  "private key heads": fill("-----BEGIN A "),
};

describe("detector cost on hostile input", () => {
  it.each(Object.entries(HOSTILE))("scans %s in linear time", (_name, text) => {
    const started = performance.now();
    hasLocalPath(text);
    genericSecrets(text);
    hasMultilinePassword(text, text);
    expect(performance.now() - started).toBeLessThan(BOUND_MS);
  });

  it("still finds a path or secret at the end of a hostile run", () => {
    expect(hasLocalPath(fill("/") + "home/kai")).toBe(true);
    expect(hasLocalPath(fill("a-") + " /srv/x/y")).toBe(true);
    expect(genericSecrets(fill("eyJ-") + " " + ["eyJ", "hbGciOiJIUzI1NiJ9", ".eyJ", "zdWIiOiIxIn0", ".c2ln"].join(""))).toEqual(["secret-jwt"]);
  });
});
