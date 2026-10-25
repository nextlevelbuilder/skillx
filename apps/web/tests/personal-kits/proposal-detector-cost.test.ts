/**
 * The proposal detectors run in time linear in the text. Each input is built
 * to make a backtracking pattern quadratic (long separator runs, `a-a-a-...`
 * scheme runs, `eyJ-eyJ-...`, repeated keys, blank lines under a YAML key)
 * and scanned at 128 KiB and at 1 MiB: 8 times the text may cost at most 24
 * times the time (a quadratic pattern costs 64 times), measured as the best
 * of several runs, with a small floor so timer noise on fast inputs is not
 * read as growth. No wall-clock bound, so a slow runner does not fail it:
 * the 1 MiB cases take seconds, so they get a timeout far above vitest's
 * 5 s default, which a parallel full-suite run would otherwise exceed.
 */
import { describe, expect, it } from "vitest";
import { genericSecrets, hasLocalPath, hasMultilinePassword } from "~/lib/personal-kits/proposal-detectors";

const SIZE = 1024 * 1024;
const SMALL = SIZE / 8;
const repeatTo = (unit: string, size: number) => unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
const fill = (unit: string) => repeatTo(unit, SIZE);
const MAX_RATIO = 24;
const FLOOR_MS = 5;
const RUNS = 3;
const SCAN_TIMEOUT_MS = 120_000;

type Build = (size: number) => string;
const unit = (u: string): Build => (size) => repeatTo(u, size);
const after = (head: string, u: string): Build => (size) => head + repeatTo(u, size);

const HOSTILE: Record<string, Build> = {
  "slashes": unit("/"),
  "backslashes": unit("\\"),
  "JSON-escaped slashes": unit("\\/"),
  "percent-encoded slashes": unit("%2F"),
  "double-encoded slashes": unit("%252F"),
  "scheme-like dashes": unit("a-"),
  "scheme-like pluses": unit("a+"),
  "drive-like colons": unit("a:"),
  "JWT-like heads": unit("eyJ-"),
  "dollar segments": unit("/usr/$"),
  "allowed system paths": unit(" /usr/bin/x"),
  "climbing segments": unit("/a/.."),
  "editor links": unit("x://file"),
  "glued flags": unit(" -I"),
  "flag-like dashes": after(" -", "a"),
  "one long segment": after(" /", "a"),
  "non-ASCII segments": unit("/é"),
  "UNC-like runs": unit("\\\\ab"),
  "secret key words": unit("TOKEN"),
  "password words": unit("password"),
  "password assignments": unit("password: "),
  "chained assignments": unit("a="),
  "flag-like assignments": unit("-a-a-a="),
  "quoted key chains": unit('"k":'),
  "long keys": unit("k".repeat(128) + "="),
  "long secret values": unit("token=" + "v".repeat(300) + ";"),
  "anchors and tags": unit("password: &a !s "),
  "encoded dot layers": unit("%25"),
  "Unicode slashes": unit("\uff0fa"),
  "credential URLs": unit("x://a:"),
  "YAML password keys": unit("password:\n"),
  "YAML list password keys": unit("- password:\n  \n"),
  "private key heads": unit("-----BEGIN A "),
  "blank lines under a YAML password key": (size) => "password:\n" + repeatTo("   \n", size) + "x\n",
};

describe("detector cost on hostile input", () => {
  /** The best of `RUNS` timings of every detector on `text`. */
  function cost(text: string): number {
    let best = Infinity;
    for (let i = 0; i < RUNS; i++) {
      const started = performance.now();
      hasLocalPath(text);
      genericSecrets(text);
      hasMultilinePassword(text, text);
      best = Math.min(best, performance.now() - started);
    }
    return best;
  }

  it.each(Object.entries(HOSTILE))("scans %s in linear time", (_name, build) => {
    const small = cost(build(SMALL));
    const large = cost(build(SIZE));
    expect(large).toBeLessThan(MAX_RATIO * Math.max(small, FLOOR_MS));
  }, SCAN_TIMEOUT_MS);

  it("still finds a path or secret at the end of a hostile run", () => {
    expect(hasLocalPath(fill("/") + "home/alice")).toBe(true);
    expect(hasLocalPath(fill("a-") + " /srv/x/y")).toBe(true);
    expect(genericSecrets(fill("eyJ-") + " " + ["eyJ", "hbGciOiJIUzI1NiJ9", ".eyJ", "zdWIiOiIxIn0", ".c2ln"].join(""))).toEqual(["secret-jwt"]);
  }, SCAN_TIMEOUT_MS);
});
