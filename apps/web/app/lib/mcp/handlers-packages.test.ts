import { describe, expect, it } from "vitest";
import { applyDangerPolicy } from "./handlers-packages";

const pkg = { slug: "s", content: "SECRET BODY", contentIncluded: true };

describe("applyDangerPolicy", () => {
  it("drops content from a danger listing and says why", () => {
    const out = applyDangerPolicy(pkg, "danger") as Record<string, unknown>;
    expect(out).not.toHaveProperty("content");
    expect(out.contentIncluded).toBe(false);
    expect(String(out.contentOmitted)).toContain("danger");
    expect(out.slug).toBe("s");
  });

  it("leaves safe, caution, unknown and unlabelled listings untouched", () => {
    for (const label of ["safe", "caution", "unknown", null, undefined]) {
      expect(applyDangerPolicy(pkg, label)).toEqual(pkg);
    }
  });
});
